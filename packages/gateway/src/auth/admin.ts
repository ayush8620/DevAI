import { timingSafeEqual } from 'node:crypto';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { parseAllowedOrigins } from '../middleware/cors.js';
import { logger } from '../middleware/logger.js';

/**
 * Admin authentication: a request to /admin/* is allowed with EITHER
 *   - the static ADMIN_API_KEY, or
 *   - a Clerk session JWT of a user on the allowlist (ADMIN_EMAILS / ADMIN_USER_IDS).
 *
 * DevAI is single-tenant, so a valid Clerk session alone is not enough: the user must
 * be explicitly allowlisted. With no allowlist configured, Clerk tokens are refused.
 */

export interface AdminAuthSettings {
  adminApiKey: string;
  /** Clerk secret key (sk_...). Used to fetch the JWKS and look up user emails. */
  clerkSecretKey?: string;
  /** Clerk JWT public key (PEM) for networkless verification. */
  clerkJwtKey?: string;
  /** Allowed `azp` values (the dashboard origins). Empty = not checked. */
  authorizedParties: string[];
  adminEmails: string[];
  adminUserIds: string[];
}

export type AdminAuthResult =
  | { ok: true; method: 'admin_key' }
  | { ok: true; method: 'clerk'; userId: string; email?: string }
  | { ok: false; status: 401 | 403; message: string };

export interface AdminAuthDeps {
  /** Look up a user's email addresses (primary first). Defaults to the Clerk Backend API. */
  getUserEmails?: (userId: string, secretKey: string) => Promise<string[]>;
  verify?: typeof verifyToken;
}

const list = (raw: string | undefined) =>
  (raw || '').split(',').map(s => s.trim()).filter(Boolean);

/** PEM keys are often pasted into env vars with literal "\n" sequences. */
function normalizePem(raw: string | undefined): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

export function adminAuthSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): AdminAuthSettings {
  return {
    adminApiKey: env.ADMIN_API_KEY || '',
    clerkSecretKey: env.CLERK_SECRET_KEY?.trim() || undefined,
    clerkJwtKey: normalizePem(env.CLERK_JWT_KEY),
    authorizedParties: parseAllowedOrigins(env.ALLOWED_ORIGINS).filter(o => o !== '*'),
    adminEmails: list(env.ADMIN_EMAILS).map(e => e.toLowerCase()),
    adminUserIds: list(env.ADMIN_USER_IDS),
  };
}

export function clerkEnabled(s: AdminAuthSettings): boolean {
  return Boolean(s.clerkSecretKey || s.clerkJwtKey);
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const looksLikeJwt = (t: string) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t);

// userId -> emails, cached so the Clerk API is not called on every dashboard request.
const EMAIL_TTL_MS = 10 * 60 * 1000;
const emailCache = new Map<string, { emails: string[]; at: number }>();
export function clearEmailCache() { emailCache.clear(); }

async function clerkUserEmails(userId: string, secretKey: string): Promise<string[]> {
  const user = await createClerkClient({ secretKey }).users.getUser(userId);
  const primary = user.primaryEmailAddress?.emailAddress;
  const all = user.emailAddresses
    // Only verified addresses count, so nobody can add an admin's address unverified.
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress);
  return [...new Set([primary, ...all].filter((e): e is string => Boolean(e)))]
    .filter(e => all.includes(e));
}

async function emailsFor(userId: string, s: AdminAuthSettings, deps: AdminAuthDeps): Promise<string[]> {
  const hit = emailCache.get(userId);
  if (hit && Date.now() - hit.at < EMAIL_TTL_MS) return hit.emails;
  if (!s.clerkSecretKey) return [];
  const emails = (await (deps.getUserEmails || clerkUserEmails)(userId, s.clerkSecretKey))
    .map(e => e.toLowerCase());
  emailCache.set(userId, { emails, at: Date.now() });
  return emails;
}

let warnedNoAllowlist = false;

export async function authenticateAdmin(
  token: string,
  s: AdminAuthSettings = adminAuthSettingsFromEnv(),
  deps: AdminAuthDeps = {},
): Promise<AdminAuthResult> {
  if (safeEqual(token, s.adminApiKey)) return { ok: true, method: 'admin_key' };

  if (!looksLikeJwt(token) || !clerkEnabled(s)) {
    return { ok: false, status: 401, message: 'Invalid Admin API key' };
  }

  const verify = deps.verify || verifyToken;
  let payload: Record<string, unknown>;
  try {
    const result = await verify(token, {
      ...(s.clerkJwtKey ? { jwtKey: s.clerkJwtKey } : { secretKey: s.clerkSecretKey }),
      ...(s.authorizedParties.length ? { authorizedParties: s.authorizedParties } : {}),
    });
    // The public export returns the payload and throws on failure; older builds
    // return { data, errors }. Support both.
    const r = result as unknown as { data?: unknown; errors?: Array<{ reason?: string; message?: string }> };
    if (r && Array.isArray(r.errors)) {
      logger.info({ reason: r.errors[0]?.reason || r.errors[0]?.message }, 'Clerk token rejected');
      return { ok: false, status: 401, message: 'Invalid or expired session token' };
    }
    payload = ((r && typeof r === 'object' && 'data' in r && r.data) ? r.data : r) as Record<string, unknown>;
  } catch (err: any) {
    logger.info({ err: err?.message }, 'Clerk token verification failed');
    return { ok: false, status: 401, message: 'Invalid or expired session token' };
  }

  const userId = typeof payload.sub === 'string' ? payload.sub : '';
  if (!userId) return { ok: false, status: 401, message: 'Invalid session token' };

  if (!s.adminEmails.length && !s.adminUserIds.length) {
    if (!warnedNoAllowlist) {
      warnedNoAllowlist = true;
      logger.warn('Clerk sign-in is configured but ADMIN_EMAILS / ADMIN_USER_IDS are empty: Clerk users are denied admin access (ADMIN_API_KEY still works)');
    }
    return { ok: false, status: 403, message: 'No admin users are configured on the gateway (set ADMIN_EMAILS or ADMIN_USER_IDS)' };
  }

  if (s.adminUserIds.includes(userId)) return { ok: true, method: 'clerk', userId };

  if (s.adminEmails.length) {
    // Use an email claim if a custom session token template adds one; otherwise ask Clerk.
    const claim = [payload.email, payload.primary_email, payload.email_address]
      .find((v): v is string => typeof v === 'string' && v.length > 0);
    let emails: string[];
    try {
      emails = claim ? [claim.toLowerCase()] : await emailsFor(userId, s, deps);
    } catch (err: any) {
      logger.error({ err: err?.message, userId }, 'Could not look up Clerk user email');
      return { ok: false, status: 403, message: 'Could not verify that this user is an admin' };
    }
    const match = emails.find(e => s.adminEmails.includes(e));
    if (match) return { ok: true, method: 'clerk', userId, email: match };
  }

  return { ok: false, status: 403, message: 'This account is not allowed to access the DevAI admin API' };
}

/** Audit-log actor for an admin request: the Clerk email / user id, or "admin" for the API key. */
export function adminActor(c: { get: (key: 'adminAuth') => unknown }): string {
  const a = c.get('adminAuth') as { method?: string; userId?: string; email?: string } | undefined;
  if (a?.method === 'clerk') return a.email || `clerk:${a.userId}`;
  return 'admin';
}
