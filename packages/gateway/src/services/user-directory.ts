import { createClerkClient } from '@clerk/backend';
import { isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, providers } from '../db/schema/index.js';
import { adminAuthSettingsFromEnv } from '../auth/admin.js';
import { logger } from '../middleware/logger.js';

/**
 * Where the admin panel reads users from. DevAI users live in Clerk (no users table), so the
 * default directory is the Clerk Backend API (free tier, no extra service). Plans are the
 * Clerk publicMetadata.billing record the dashboard writes after a Razorpay payment.
 * Without CLERK_SECRET_KEY the directory falls back to the user ids found in the database
 * (pool/kit owners), without emails. Tests inject their own directory.
 */
export interface DirectoryUser {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  lastSignInAt: string | null;
  /** Clerk publicMetadata.billing, as stored */
  billing: unknown;
}

export interface UserDirectory {
  readonly source: 'clerk' | 'database' | 'test';
  list(opts: { query?: string; limit: number; offset: number }): Promise<{ users: DirectoryUser[]; total: number }>;
  get(userId: string): Promise<DirectoryUser | null>;
  /** Up to `max` users, newest first (overview + subscriptions). */
  all(max: number): Promise<DirectoryUser[]>;
  byIds(ids: string[]): Promise<DirectoryUser[]>;
  /** Replace publicMetadata.billing (null removes it). Other metadata keys are kept. */
  setBilling(userId: string, billing: Record<string, unknown> | null): Promise<void>;
}

const iso = (ms: number | null | undefined) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null);

function fromClerk(u: any): DirectoryUser {
  const primary = u.primaryEmailAddress?.emailAddress
    ?? u.emailAddresses?.find((e: any) => e.id === u.primaryEmailAddressId)?.emailAddress
    ?? u.emailAddresses?.[0]?.emailAddress ?? null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null;
  return {
    id: u.id, email: primary, name, imageUrl: u.imageUrl ?? null,
    createdAt: iso(u.createdAt), lastActiveAt: iso(u.lastActiveAt), lastSignInAt: iso(u.lastSignInAt),
    billing: u.publicMetadata?.billing ?? null,
  };
}

export function clerkDirectory(secretKey: string): UserDirectory {
  const clerk = createClerkClient({ secretKey });
  return {
    source: 'clerk',
    async list({ query, limit, offset }) {
      const r = await clerk.users.getUserList({ limit, offset, orderBy: '-created_at', ...(query ? { query } : {}) });
      return { users: r.data.map(fromClerk), total: r.totalCount };
    },
    async get(userId) {
      try { return fromClerk(await clerk.users.getUser(userId)); } catch (err: any) {
        if (err?.status === 404 || err?.errors?.[0]?.code === 'resource_not_found') return null;
        throw err;
      }
    },
    async all(max) {
      const out: DirectoryUser[] = [];
      for (let offset = 0; offset < max; offset += 500) {
        const r = await clerk.users.getUserList({ limit: Math.min(500, max - offset), offset, orderBy: '-created_at' });
        out.push(...r.data.map(fromClerk));
        if (r.data.length < 500) break;
      }
      return out;
    },
    async byIds(ids) {
      const out: DirectoryUser[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const r = await clerk.users.getUserList({ userId: ids.slice(i, i + 100), limit: 100 });
        out.push(...r.data.map(fromClerk));
      }
      return out;
    },
    async setBilling(userId, billing) {
      await clerk.users.updateUserMetadata(userId, { publicMetadata: { billing } as any });
    },
  };
}

/** No Clerk secret: users are the owner ids seen in the database (no emails, no plans). */
export function databaseDirectory(): UserDirectory {
  const ids = async (): Promise<{ id: string; createdAt: string | null }[]> => {
    const rows = await db.execute(sql`
      SELECT owner_user_id AS id, min(created_at) AS created_at FROM (
        SELECT ${projects.ownerUserId} AS owner_user_id, ${projects.createdAt} AS created_at FROM ${projects} WHERE ${isNotNull(projects.ownerUserId)}
        UNION ALL
        SELECT ${providers.ownerUserId}, ${providers.createdAt} FROM ${providers} WHERE ${isNotNull(providers.ownerUserId)}
      ) o GROUP BY owner_user_id ORDER BY min(created_at) DESC`);
    const list = ((rows as any).rows ?? rows) as any[];
    return list.map(r => ({ id: String(r.id), createdAt: r.created_at ? new Date(r.created_at).toISOString() : null }));
  };
  const make = (r: { id: string; createdAt: string | null }): DirectoryUser =>
    ({ id: r.id, email: null, name: null, imageUrl: null, createdAt: r.createdAt, lastActiveAt: null, lastSignInAt: null, billing: null });
  return {
    source: 'database',
    async list({ query, limit, offset }) {
      const all = (await ids()).filter(r => !query || r.id.toLowerCase().includes(query.toLowerCase()));
      return { users: all.slice(offset, offset + limit).map(make), total: all.length };
    },
    async get(userId) { return (await ids()).filter(r => r.id === userId).map(make)[0] ?? null; },
    async all(max) { return (await ids()).slice(0, max).map(make); },
    async byIds(want) { const s = new Set(want); return (await ids()).filter(r => s.has(r.id)).map(make); },
    async setBilling() { throw new DirectoryUnavailableError('Changing a plan needs CLERK_SECRET_KEY on the gateway'); },
  };
}

export class DirectoryUnavailableError extends Error {}

let override: UserDirectory | null = null;
/** Tests: replace the directory (null restores the default). */
export function setUserDirectory(d: UserDirectory | null) { override = d; allCache = null; }

export function userDirectory(): UserDirectory {
  if (override) return override;
  const key = adminAuthSettingsFromEnv().clerkSecretKey;
  return key ? clerkDirectory(key) : databaseDirectory();
}

// The overview and subscription pages scan every user; cache that scan briefly.
const ALL_TTL_MS = 60 * 1000;
export const MAX_SCAN = 5000;
let allCache: { at: number; users: DirectoryUser[]; source: string } | null = null;
export function clearDirectoryCache() { allCache = null; }

export async function allUsers(): Promise<DirectoryUser[]> {
  const dir = userDirectory();
  if (allCache && allCache.source === dir.source && Date.now() - allCache.at < ALL_TTL_MS) return allCache.users;
  const users = await dir.all(MAX_SCAN);
  if (users.length >= MAX_SCAN) logger.warn({ max: MAX_SCAN }, 'Admin user scan hit its cap; subscription totals may be partial');
  allCache = { at: Date.now(), users, source: dir.source };
  return users;
}
