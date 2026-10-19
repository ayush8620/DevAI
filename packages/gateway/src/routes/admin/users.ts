import { Hono } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../../types/index.js';
import { db } from '../../db/index.js';
import { apiKeys, hackathonKits, projects, providerCredentials, providers } from '../../db/schema/index.js';
import { adminActor, adminAuthSettingsFromEnv } from '../../auth/admin.js';
import { clearPlanCache } from '../../auth/user.js';
import { clampInt, compBilling, isRecurring, parsePlanChange, subscriptionRow } from '../../billing/admin.js';
import { planFromBilling, type PaidPlanId } from '../../billing/plans.js';
import { decrypt } from '../../crypto/encryption.js';
import { maskSecret } from '../../engine/keys.js';
import { kitStatus } from '../user/kits.js';
import { accountsFor, isMissingTable, setSuspension, type AccountRow } from '../../services/accounts.js';
import { byokKeyCounts, perUserActivity, projectIdsOf, usageByDay, usageByModel, usageSince, startOfToday } from '../../services/admin-usage.js';
import { logAudit } from '../../services/audit.js';
import { clearDirectoryCache, DirectoryUnavailableError, userDirectory, type DirectoryUser } from '../../services/user-directory.js';
import { DAY_MS, clientIp, fail, serverError } from './_util.js';

/** /admin/users: search, detail, manual plan (comp) and suspend / unsuspend. */
export const adminUserRoutes = new Hono<AppEnv>();

function isAllowlisted(u: { id: string; email: string | null }): boolean {
  const s = adminAuthSettingsFromEnv();
  return s.adminUserIds.includes(u.id) || Boolean(u.email && s.adminEmails.includes(u.email.toLowerCase()));
}

function accountView(a: AccountRow | undefined) {
  return {
    status: a?.status ?? 'active',
    suspendedReason: a?.suspendedReason ?? null,
    suspendedAt: a?.suspendedAt ?? null,
    suspendedBy: a?.suspendedBy ?? null,
  };
}

function summary(u: DirectoryUser) {
  return {
    id: u.id, email: u.email, name: u.name, imageUrl: u.imageUrl,
    createdAt: u.createdAt, lastActiveAt: u.lastActiveAt, lastSignInAt: u.lastSignInAt,
    plan: planFromBilling(u.billing),
    isAdmin: isAllowlisted(u),
  };
}

adminUserRoutes.get('/', async (c) => {
  const limit = clampInt(c.req.query('limit'), 25, 1, 100);
  const page = clampInt(c.req.query('page'), 1, 1, 10_000);
  const query = (c.req.query('q') || '').trim().slice(0, 100) || undefined;
  try {
    const dir = userDirectory();
    const { users, total } = await dir.list({ query, limit, offset: (page - 1) * limit });
    const ids = users.map(u => u.id);
    const [accounts, activity, byok] = await Promise.all([
      accountsFor(ids), perUserActivity(ids, new Date(Date.now() - 30 * DAY_MS)), byokKeyCounts(ids),
    ]);
    const data = users.map(u => {
      const act = activity.get(u.id);
      const lastActive = [u.lastActiveAt, act?.lastRequestAt].filter(Boolean).sort().pop() ?? null;
      return {
        ...summary(u),
        status: accounts.get(u.id)?.status ?? 'active',
        lastActiveAt: lastActive,
        requests30d: act?.requests ?? 0,
        byokKeys: byok.get(u.id) ?? 0,
      };
    });
    return c.json({ data, page, limit, total, source: dir.source });
  } catch (err) {
    return serverError(c, err, 'list users');
  }
});

adminUserRoutes.get('/:id', async (c) => {
  const userId = c.req.param('id');
  try {
    const u = await userDirectory().get(userId);
    const projs = await db.select().from(projects).where(eq(projects.ownerUserId, userId)).orderBy(desc(projects.createdAt));
    if (!u && !projs.length) return fail(c, 404, 'not_found', 'User not found');
    const user: DirectoryUser = u ?? { id: userId, email: null, name: null, imageUrl: null, createdAt: null, lastActiveAt: null, lastSignInAt: null, billing: null };
    const projectIds = projs.map(p => p.id);

    const [accounts, keys, owned, kits, today, last30, days, models] = await Promise.all([
      accountsFor([userId]),
      projectIds.length ? db.select().from(apiKeys).where(inArray(apiKeys.projectId, projectIds)).orderBy(desc(apiKeys.createdAt)) : Promise.resolve([]),
      db.select({ cred: providerCredentials, provider: providers }).from(providerCredentials)
        .innerJoin(providers, eq(providers.id, providerCredentials.providerId))
        .where(eq(providers.ownerUserId, userId)).orderBy(desc(providerCredentials.createdAt)),
      db.select().from(hackathonKits).where(eq(hackathonKits.ownerUserId, userId)).orderBy(desc(hackathonKits.createdAt)),
      usageSince(startOfToday(), projectIds),
      usageSince(new Date(Date.now() - 30 * DAY_MS), projectIds),
      usageByDay(30, projectIds),
      usageByModel(new Date(Date.now() - 30 * DAY_MS), projectIds),
    ]);

    return c.json({
      data: {
        user: summary(user),
        account: accountView(accounts.get(userId)),
        subscription: subscriptionRow(user.billing),
        projects: projs.map(p => ({
          id: p.id, name: p.name, kind: p.kind, status: p.status, createdAt: p.createdAt,
          apiKeys: keys.filter(k => k.projectId === p.id).map(k => ({
            id: k.id, name: k.name, key: `${k.keyPrefix}…`, status: k.status, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt,
          })),
        })),
        byokKeys: owned.map(({ cred, provider }) => {
          let key = '••••';
          if (cred.encryptedKey !== 'removed') { try { key = maskSecret(decrypt({ ciphertext: cred.encryptedKey, iv: cred.iv, authTag: cred.authTag })); } catch { /* unreadable */ } }
          return {
            id: cred.id, name: cred.name, provider: provider.name, providerType: provider.type, key,
            enabled: cred.enabled !== false, status: cred.status ?? 'active', lastError: cred.lastError,
            quotaLimit: cred.quotaLimit, quotaUsed: cred.quotaUsed ?? 0, createdAt: cred.createdAt,
          };
        }),
        kits: kits.map(k => ({ id: k.id, name: k.name, status: kitStatus(k), keyCount: k.keyCount, expiresAt: k.expiresAt, createdAt: k.createdAt })),
        usage: { today, last30, days, models },
      },
    });
  } catch (err) {
    return serverError(c, err, 'load the user');
  }
});

adminUserRoutes.post('/:id/plan', async (c) => {
  const userId = c.req.param('id');
  const parsed = parsePlanChange(await c.req.json().catch(() => ({})));
  if (!parsed.ok) return fail(c, 400, 'validation_error', parsed.message);
  const change = parsed.value;
  const actor = adminActor(c as any);
  try {
    const dir = userDirectory();
    const u = await dir.get(userId);
    if (!u) return fail(c, 404, 'not_found', 'User not found');
    if (isRecurring(u.billing) && !change.force) {
      return fail(c, 409, 'has_subscription', 'This user has a renewing Razorpay subscription. Cancel it in Razorpay first, or confirm to overwrite the stored plan.');
    }
    const before = subscriptionRow(u.billing);
    const billing = change.plan === 'free' ? null : compBilling({ ...change, plan: change.plan as PaidPlanId }, actor);
    await dir.setBilling(userId, billing);
    clearPlanCache(userId);
    clearDirectoryCache();
    await logAudit({
      actor, action: 'user.plan_changed', resourceType: 'user', resourceId: userId, ipAddress: clientIp(c),
      details: {
        email: u.email, from: before ? { plan: before.plan, period: before.period, status: before.status, source: before.source } : 'free',
        to: change.plan, period: change.plan === 'free' ? null : change.period, days: change.plan === 'free' ? null : change.days,
        expiresAt: billing?.expiresAt ?? null, note: change.note, overwroteSubscription: change.force && Boolean(before?.renews),
      },
    });
    return c.json({ data: { userId, plan: planFromBilling(billing), subscription: subscriptionRow(billing) } });
  } catch (err) {
    if (err instanceof DirectoryUnavailableError) return fail(c, 503, 'clerk_not_configured', err.message);
    return serverError(c, err, 'change the plan');
  }
});

async function suspension(c: any, suspend: boolean) {
  const userId = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as any;
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
  const actor = adminActor(c);
  try {
    const u = await userDirectory().get(userId);
    const known = Boolean(u) || (await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerUserId, userId)).limit(1)).length > 0;
    if (!known) return fail(c, 404, 'not_found', 'User not found');
    if (suspend && isAllowlisted({ id: userId, email: u?.email ?? null })) {
      return fail(c, 400, 'cannot_suspend_admin', 'Admins on ADMIN_EMAILS / ADMIN_USER_IDS cannot be suspended. Remove them from the allowlist first.');
    }
    const row = await setSuspension(userId, suspend, actor, reason);
    await logAudit({
      actor, action: suspend ? 'user.suspended' : 'user.unsuspended', resourceType: 'user', resourceId: userId,
      ipAddress: clientIp(c), details: { email: u?.email ?? null, reason },
    });
    return c.json({ data: { userId, ...accountView(row) } });
  } catch (err: any) {
    if (isMissingTable(err)) return fail(c, 503, 'migration_required', 'Run packages/gateway/drizzle/0004_admin_panel.sql on the database first.');
    return serverError(c, err, suspend ? 'suspend the user' : 'unsuspend the user');
  }
}

adminUserRoutes.post('/:id/suspend', (c) => suspension(c, true));
adminUserRoutes.post('/:id/unsuspend', (c) => suspension(c, false));
