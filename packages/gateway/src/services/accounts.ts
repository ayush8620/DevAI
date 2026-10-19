import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userAccounts } from '../db/schema/index.js';
import { logger } from '../middleware/logger.js';

/**
 * Suspension of Clerk users (table user_accounts, drizzle/0004_admin_panel.sql).
 * Checked on every /user/* call and on /v1 calls made with a user's pool or kit key, so the
 * answer is cached for a short time. Until the migration is run everybody counts as active.
 */
const TTL_MS = 30 * 1000;
const cache = new Map<string, { suspended: boolean; at: number }>();
let warnedMissing = false;

export function clearSuspensionCache(userId?: string) {
  if (userId) cache.delete(userId); else cache.clear();
}

/** Postgres "undefined_table" (the migration has not been run yet). */
export function isMissingTable(err: any): boolean {
  const code = err?.code ?? err?.cause?.code;
  return code === '42P01' || /relation "user_accounts" does not exist/i.test(String(err?.message ?? err?.cause?.message ?? ''));
}

export async function isSuspended(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.suspended;
  let suspended = false;
  try {
    const [row] = await db.select({ status: userAccounts.status }).from(userAccounts).where(eq(userAccounts.userId, userId)).limit(1);
    suspended = row?.status === 'suspended';
  } catch (err: any) {
    if (isMissingTable(err)) {
      if (!warnedMissing) { warnedMissing = true; logger.warn('user_accounts table is missing: run drizzle/0004_admin_panel.sql to enable suspensions'); }
    } else {
      // Fail open: a database hiccup must not lock every user out. The request itself still needs the DB.
      logger.error({ err: err?.message, userId }, 'Suspension check failed');
    }
    return false;
  }
  cache.set(userId, { suspended, at: Date.now() });
  return suspended;
}

export type AccountRow = typeof userAccounts.$inferSelect;

/** Accounts for the given users (missing = active, never acted on). */
export async function accountsFor(userIds: string[]): Promise<Map<string, AccountRow>> {
  const out = new Map<string, AccountRow>();
  if (!userIds.length) return out;
  try {
    const rows = await db.select().from(userAccounts).where(inArray(userAccounts.userId, userIds));
    for (const r of rows) out.set(r.userId, r);
  } catch (err: any) {
    if (!isMissingTable(err)) throw err;
  }
  return out;
}

export async function setSuspension(userId: string, suspend: boolean, actor: string, reason: string | null): Promise<AccountRow> {
  const now = new Date();
  const values = suspend
    ? { status: 'suspended' as const, suspendedReason: reason, suspendedAt: now, suspendedBy: actor, updatedAt: now }
    : { status: 'active' as const, suspendedReason: null, suspendedAt: null, suspendedBy: null, updatedAt: now };
  const [row] = await db.insert(userAccounts).values({ userId, ...values })
    .onConflictDoUpdate({ target: userAccounts.userId, set: values })
    .returning();
  clearSuspensionCache(userId);
  return row;
}

export async function suspendedCount(): Promise<number> {
  try {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(userAccounts).where(eq(userAccounts.status, 'suspended'));
    return Number(r?.n) || 0;
  } catch (err: any) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}
