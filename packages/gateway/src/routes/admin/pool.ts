import { Hono } from 'hono';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { AppEnv } from '../../types/index.js';
import { db } from '../../db/index.js';
import { apiKeys, hackathonKits, projects, providerCredentials, providers } from '../../db/schema/index.js';
import { adminActor } from '../../auth/admin.js';
import { clampInt } from '../../billing/admin.js';
import { decrypt } from '../../crypto/encryption.js';
import { maskSecret } from '../../engine/keys.js';
import { kitUsage } from '../../engine/kit-limits.js';
import { kitStatus } from '../user/kits.js';
import { busiestPoolKeys, poolCounts } from '../../services/admin-usage.js';
import { logAudit } from '../../services/audit.js';
import { userDirectory } from '../../services/user-directory.js';
import { clientIp, fail, serverError } from './_util.js';

/** /admin/pool: BYOK key pool and hackathon kit counts, plus revoking an abusive key or kit. */
export const adminPoolRoutes = new Hono<AppEnv>();

async function emailsFor(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  try {
    for (const u of await userDirectory().byIds(unique)) out.set(u.id, u.email);
  } catch { /* emails are optional here */ }
  return out;
}

adminPoolRoutes.get('/', async (c) => {
  const days = clampInt(c.req.query('days'), 7, 1, 90);
  try {
    const [counts, keys, kits, poolKeys] = await Promise.all([
      poolCounts(),
      busiestPoolKeys(days, clampInt(c.req.query('limit'), 25, 1, 100)),
      db.select().from(hackathonKits).orderBy(desc(hackathonKits.createdAt)).limit(50),
      db.select({ key: apiKeys, ownerUserId: projects.ownerUserId }).from(apiKeys)
        .innerJoin(projects, eq(projects.id, apiKeys.projectId))
        .where(and(eq(projects.kind, 'pool'), isNotNull(projects.ownerUserId)))
        .orderBy(desc(apiKeys.lastUsedAt)).limit(25),
    ]);
    const emails = await emailsFor([...keys.map(k => k.ownerUserId!), ...kits.map(k => k.ownerUserId), ...poolKeys.map(k => k.ownerUserId!)]);
    return c.json({
      data: {
        counts,
        windowDays: days,
        providerKeys: keys.map(k => {
          let key = '••••';
          if (k.encryptedKey !== 'removed') { try { key = maskSecret(decrypt({ ciphertext: k.encryptedKey, iv: k.iv, authTag: k.authTag })); } catch { /* unreadable */ } }
          return {
            id: k.id, name: k.name, provider: k.providerName, key, ownerUserId: k.ownerUserId, ownerEmail: emails.get(k.ownerUserId!) ?? null,
            enabled: k.enabled !== false, status: k.status ?? 'active', lastError: k.lastError,
            requests: Number(k.requests) || 0, errors: Number(k.errors) || 0, createdAt: k.createdAt,
          };
        }),
        poolApiKeys: poolKeys.map(({ key, ownerUserId }) => ({
          id: key.id, name: key.name, key: `${key.keyPrefix}…`, status: key.status, lastUsedAt: key.lastUsedAt, createdAt: key.createdAt,
          ownerUserId, ownerEmail: emails.get(ownerUserId!) ?? null,
        })),
        kits: await Promise.all(kits.map(async k => ({
          id: k.id, name: k.name, ownerUserId: k.ownerUserId, ownerEmail: emails.get(k.ownerUserId) ?? null,
          status: kitStatus(k), keyCount: k.keyCount, requestCap: k.requestCap, tokenCap: k.tokenCap,
          expiresAt: k.expiresAt, createdAt: k.createdAt, revokedAt: k.revokedAt,
          usage: await kitUsage(k).catch(() => null),
        }))),
      },
    });
  } catch (err) {
    return serverError(c, err, 'load the key pool');
  }
});

const reasonOf = async (c: any) => {
  const body = await c.req.json().catch(() => ({})) as any;
  return typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
};

/** Revoke a user's provider key: routing skips it and the user cannot enable it again. */
adminPoolRoutes.post('/keys/:id/revoke', async (c) => {
  const reason = await reasonOf(c);
  try {
    const [row] = await db.select({ id: providerCredentials.id, ownerUserId: providers.ownerUserId, name: providerCredentials.name, provider: providers.name })
      .from(providerCredentials).innerJoin(providers, eq(providers.id, providerCredentials.providerId))
      .where(and(eq(providerCredentials.id, c.req.param('id')), isNotNull(providers.ownerUserId))).limit(1);
    if (!row) return fail(c, 404, 'not_found', 'Pool key not found');
    await db.update(providerCredentials)
      .set({ enabled: false, status: 'revoked', lastError: `Revoked by an admin${reason ? `: ${reason}` : ''}`, updatedAt: new Date() })
      .where(eq(providerCredentials.id, row.id));
    await logAudit({ actor: adminActor(c as any), action: 'pool_key.revoked', resourceType: 'credential', resourceId: row.id, ipAddress: clientIp(c), details: { ownerUserId: row.ownerUserId, name: row.name, provider: row.provider, reason } });
    return c.json({ data: { id: row.id, status: 'revoked' } });
  } catch (err) {
    return serverError(c, err, 'revoke the key');
  }
});

/** Revoke a dvai_ API key of a user's pool or kit project. */
adminPoolRoutes.post('/api-keys/:id/revoke', async (c) => {
  const reason = await reasonOf(c);
  try {
    const [row] = await db.select({ id: apiKeys.id, name: apiKeys.name, ownerUserId: projects.ownerUserId, kind: projects.kind })
      .from(apiKeys).innerJoin(projects, eq(projects.id, apiKeys.projectId))
      .where(and(eq(apiKeys.id, c.req.param('id')), isNotNull(projects.ownerUserId))).limit(1);
    if (!row) return fail(c, 404, 'not_found', 'API key not found');
    await db.update(apiKeys).set({ status: 'revoked' }).where(eq(apiKeys.id, row.id));
    await logAudit({ actor: adminActor(c as any), action: 'api_key.revoked', resourceType: 'api_key', resourceId: row.id, ipAddress: clientIp(c), details: { ownerUserId: row.ownerUserId, name: row.name, project: row.kind, reason } });
    return c.json({ data: { id: row.id, status: 'revoked' } });
  } catch (err) {
    return serverError(c, err, 'revoke the API key');
  }
});

adminPoolRoutes.post('/kits/:id/revoke', async (c) => {
  const reason = await reasonOf(c);
  try {
    const [kit] = await db.update(hackathonKits).set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(hackathonKits.id, c.req.param('id'))).returning();
    if (!kit) return fail(c, 404, 'not_found', 'Kit not found');
    await logAudit({ actor: adminActor(c as any), action: 'kit.revoked_by_admin', resourceType: 'hackathon_kit', resourceId: kit.id, ipAddress: clientIp(c), details: { ownerUserId: kit.ownerUserId, name: kit.name, reason } });
    return c.json({ data: { id: kit.id, status: kitStatus(kit) } });
  } catch (err) {
    return serverError(c, err, 'revoke the kit');
  }
});
