import type { Context, Next } from 'hono';
import type { AppEnv } from '../types/index.js';
import { createClerkClient } from '@clerk/backend';
import { adminAuthSettingsFromEnv, verifyClerkSession, isAllowlistedAdmin, type AdminAuthDeps } from './admin.js';
import { planFromBilling, limitsFor, type PlanId, type GatewayPlanLimits } from '../billing/plans.js';
import { logger } from '../middleware/logger.js';
import { isSuspended } from '../services/accounts.js';
import { userDirectory } from '../services/user-directory.js';

export interface UserContext {
  userId: string;
  plan: PlanId;
  isAdmin: boolean;
  limits: GatewayPlanLimits;
}

const PLAN_TTL_MS = 60 * 1000;
const planCache = new Map<string, { plan: PlanId; at: number }>();
/** Forget cached plans (one user after an admin plan change, or everyone). */
export function clearPlanCache(userId?: string) { if (userId) planCache.delete(userId); else planCache.clear(); }

/** The user's plan from Clerk publicMetadata.billing (written by the dashboard after a Razorpay payment). */
export async function planForUser(userId: string, secretKey?: string, fetchMeta?: (id: string) => Promise<unknown>): Promise<PlanId> {
  const hit = planCache.get(userId);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return hit.plan;
  let plan: PlanId = 'free';
  try {
    if (fetchMeta) {
      plan = planFromBilling(((await fetchMeta(userId)) as any)?.billing);
    } else if (secretKey) {
      plan = planFromBilling((await createClerkClient({ secretKey }).users.getUser(userId)).publicMetadata?.billing);
    } else {
      // No Clerk secret: the configured user directory (tests inject one; otherwise no plans).
      const dir = userDirectory();
      if (dir.source !== 'database') plan = planFromBilling((await dir.get(userId))?.billing);
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, userId }, 'Could not read the user plan; using Free');
  }
  planCache.set(userId, { plan, at: Date.now() });
  return plan;
}

/**
 * /user/* routes: any signed-in Clerk user (no admin allowlist). Each user only
 * sees and changes their own pool and kits.
 */
export function userAuthMiddleware(deps: AdminAuthDeps & { fetchMeta?: (id: string) => Promise<unknown> } = {}) {
  return async (c: Context<AppEnv>, next: Next) => {
    const header = c.req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return c.json({ error: { type: 'authentication_error', message: 'Sign in required' } }, 401);
    }
    const s = adminAuthSettingsFromEnv();
    const session = await verifyClerkSession(token, s, deps);
    if (!session.ok) return c.json({ error: { type: 'authentication_error', message: session.message } }, 401);
    // Suspended by an admin (user_accounts.status, drizzle/0004_admin_panel.sql)
    if (await isSuspended(session.userId)) {
      return c.json({ error: { type: 'account_suspended', message: 'This account is suspended. Contact DevAI support.' } }, 403);
    }
    const isAdmin = await isAllowlistedAdmin(session.userId, s, deps);
    const plan = await planForUser(session.userId, s.clerkSecretKey, deps.fetchMeta);
    const user: UserContext = { userId: session.userId, plan, isAdmin, limits: limitsFor(plan, isAdmin) };
    c.set('user', user);
    await next();
  };
}
