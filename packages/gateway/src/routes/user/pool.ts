import { Hono } from 'hono';
import { and, eq, gte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { providers, providerCredentials, projects, apiKeys, usageRecords } from '../../db/schema/index.js';
import { encrypt, decrypt, generateApiKey } from '../../crypto/encryption.js';
import { cacheGet } from '../../cache/redis.js';
import { maskSecret, isKeyStrategy, KEY_STRATEGIES } from '../../engine/keys.js';
import { canAddPooledKey } from '../../billing/plans.js';
import { computePoolStats, keyHealthState } from '../../engine/pool-stats.js';
import { logAudit } from '../../services/audit.js';
import { logger } from '../../middleware/logger.js';
import type { AppEnv } from '../../types/index.js';

/**
 * Personal key pool: a signed-in user adds their own provider keys (encrypted with
 * MASTER_ENCRYPTION_KEY like every other key) and gets dvai_ keys whose requests rotate
 * across that pool only, with the usual key strategies, per-key cooldowns and quotas.
 */
export const userPoolRoutes = new Hono<AppEnv>();

/** Providers a pooled key can be for. OpenRouter uses the OpenAI-compatible adapter. */
export const POOL_PROVIDERS = {
  gemini: { type: 'google', name: 'Gemini', baseUrl: null, defaultModel: 'gemini-2.5-flash', hint: 'Free key from Google AI Studio' },
  groq: { type: 'groq', name: 'Groq', baseUrl: null, defaultModel: 'llama-3.1-8b-instant', hint: 'Free key from console.groq.com' },
  openrouter: { type: 'openai', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openrouter/auto', hint: 'Key from openrouter.ai (free models end in :free)' },
  openai: { type: 'openai', name: 'OpenAI', baseUrl: null, defaultModel: 'gpt-4o-mini', hint: 'Key from platform.openai.com' },
} as const;
export type PoolProviderId = keyof typeof POOL_PROVIDERS;

function poolProviderId(p: { type: string; baseUrl: string | null }): PoolProviderId | 'other' {
  for (const [id, d] of Object.entries(POOL_PROVIDERS)) {
    if (d.type === p.type && (d.baseUrl ?? null) === (p.baseUrl ?? null)) return id as PoolProviderId;
  }
  return 'other';
}

async function ownedProviders(userId: string) {
  return db.select().from(providers).where(eq(providers.ownerUserId, userId));
}

/** The user's pool project (created on first use). */
async function poolProject(userId: string) {
  const [existing] = await db.select().from(projects)
    .where(and(eq(projects.ownerUserId, userId), eq(projects.kind, 'pool'))).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(projects).values({
    name: 'Personal key pool', description: 'Requests rotate across your own provider keys', status: 'active', kind: 'pool', ownerUserId: userId,
  }).returning();
  return created;
}

const DAY = 24 * 60 * 60 * 1000;

userPoolRoutes.get('/', async (c) => {
  const user = c.get('user')!;
  try {
    const owned = await ownedProviders(user.userId);
    const creds = owned.length
      ? await db.select().from(providerCredentials).where(inArray(providerCredentials.providerId, owned.map(p => p.id)))
      : [];
    const project = await poolProject(user.userId);
    const keys = await db.select().from(apiKeys).where(eq(apiKeys.projectId, project.id)).orderBy(desc(apiKeys.createdAt));

    // Usage of the pool over the last 30 days (pool project + this user's kits use the same keys)
    const ownedProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerUserId, user.userId));
    const rows = ownedProjects.length ? await db.select({
      credentialId: usageRecords.credentialId, status: usageRecords.status, totalTokens: usageRecords.totalTokens,
      error: usageRecords.error, createdAt: usageRecords.createdAt,
    }).from(usageRecords).where(and(
      inArray(usageRecords.projectId, ownedProjects.map(p => p.id)),
      gte(usageRecords.createdAt, new Date(Date.now() - 30 * DAY)),
    )) : [];
    const stats = computePoolStats(rows);

    const now = Date.now();
    const poolKeys = await Promise.all(creds.map(async (cr) => {
      const p = owned.find(x => x.id === cr.providerId)!;
      let masked = '••••';
      try { masked = maskSecret(decrypt({ ciphertext: cr.encryptedKey, iv: cr.iv, authTag: cr.authTag })); } catch { /* unreadable */ }
      let cooldownUntil: number | null = null;
      let lastFailure: { kind?: string; message?: string; at?: number } | null = null;
      const raw = await cacheGet(`keyerr:${cr.id}`);
      if (raw) {
        try {
          const e = JSON.parse(raw);
          lastFailure = e;
          if (typeof e.at === 'number' && typeof e.cooldownSec === 'number') cooldownUntil = e.at + e.cooldownSec * 1000;
        } catch { /* ignore */ }
      }
      const ks = stats.perKey[cr.id];
      return {
        id: cr.id,
        name: cr.name,
        provider: poolProviderId(p),
        providerName: p.name,
        key: masked,
        enabled: cr.enabled !== false,
        quotaLimit: cr.quotaLimit,
        quotaUsed: cr.quotaUsed ?? 0,
        health: keyHealthState({ enabled: cr.enabled, status: cr.status, quotaLimit: cr.quotaLimit, quotaUsed: cr.quotaUsed, cooldownUntil, used: Boolean(ks?.successes) }, now),
        cooldownUntil: cooldownUntil && cooldownUntil > now ? new Date(cooldownUntil).toISOString() : null,
        lastError: cr.lastError ?? lastFailure?.message ?? null,
        stats: ks ?? { requests: 0, successes: 0, tokens: 0, rateLimited: 0, errors: 0, lastUsedAt: null },
        createdAt: cr.createdAt,
      };
    }));

    const strategies = [...new Set(owned.map(p => (p.config as any)?.keyStrategy).filter(isKeyStrategy))];
    return c.json({
      data: {
        plan: user.plan,
        isAdmin: user.isAdmin,
        limit: user.limits.pooledKeys,
        keyStrategy: strategies[0] ?? 'round_robin',
        keys: poolKeys,
        apiKeys: keys.map(k => ({ id: k.id, name: k.name, keyPrefix: k.keyPrefix, status: k.status, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt })),
        stats: { served: stats.served, tokens: stats.tokens, rateLimitsAbsorbed: stats.rateLimitsAbsorbed, stretchFactor: stats.stretchFactor, activeKeys: stats.activeKeys, windowDays: 30 },
        providers: Object.entries(POOL_PROVIDERS).map(([id, d]) => ({ id, name: d.name, defaultModel: d.defaultModel, hint: d.hint })),
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to load key pool');
    return c.json({ error: { type: 'server_error', message: 'Failed to load your key pool' } }, 500);
  }
});

userPoolRoutes.post('/keys', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  const providerId = String(body?.provider || '') as PoolProviderId;
  const def = POOL_PROVIDERS[providerId];
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const name = (typeof body?.name === 'string' && body.name.trim()) ? body.name.trim().slice(0, 60) : `${def?.name ?? 'Key'} key`;
  if (!def) return c.json({ error: { type: 'validation_error', message: `provider must be one of: ${Object.keys(POOL_PROVIDERS).join(', ')}` } }, 400);
  if (apiKey.length < 10 || apiKey.length > 400) return c.json({ error: { type: 'validation_error', message: 'apiKey looks invalid' } }, 400);
  const quotaLimit = body?.quotaLimit === undefined || body?.quotaLimit === null || body?.quotaLimit === '' ? null : Number(body.quotaLimit);
  if (quotaLimit !== null && !(Number.isInteger(quotaLimit) && quotaLimit > 0)) {
    return c.json({ error: { type: 'validation_error', message: 'quotaLimit must be a positive whole number of tokens' } }, 400);
  }
  const defaultModel = typeof body?.defaultModel === 'string' && body.defaultModel.trim() ? body.defaultModel.trim().slice(0, 120) : def.defaultModel;

  try {
    const owned = await ownedProviders(user.userId);
    const count = owned.length
      ? (await db.select({ id: providerCredentials.id }).from(providerCredentials).where(inArray(providerCredentials.providerId, owned.map(p => p.id)))).length
      : 0;
    if (!canAddPooledKey(user.limits, count)) {
      return c.json({ error: { type: 'plan_limit_reached', message: `Your ${user.plan} plan allows ${user.limits.pooledKeys} pooled keys. Upgrade to add more.`, limit: user.limits.pooledKeys } }, 403);
    }
    let provider = owned.find(p => p.type === def.type && (p.baseUrl ?? null) === (def.baseUrl ?? null));
    if (!provider) {
      const strategy = owned.map(p => (p.config as any)?.keyStrategy).find(isKeyStrategy) ?? 'round_robin';
      [provider] = await db.insert(providers).values({
        type: def.type as any, name: def.name, baseUrl: def.baseUrl, status: 'active', ownerUserId: user.userId,
        config: { keyStrategy: strategy, defaultModel },
      }).returning();
    } else if (body?.defaultModel) {
      await db.update(providers).set({ config: { ...(provider.config as object), defaultModel }, updatedAt: new Date() }).where(eq(providers.id, provider.id));
    }
    const enc = encrypt(apiKey);
    const [cred] = await db.insert(providerCredentials).values({
      providerId: provider.id, name, encryptedKey: enc.ciphertext, iv: enc.iv, authTag: enc.authTag,
      enabled: true, status: 'active', quotaLimit,
    }).returning();
    await poolProject(user.userId);
    await logAudit({ actor: `clerk:${user.userId}`, action: 'pool_key.created', resourceType: 'credential', resourceId: cred.id, details: { provider: providerId, name } });
    return c.json({ data: { id: cred.id, name, provider: providerId, key: maskSecret(apiKey) } }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to add pooled key');
    return c.json({ error: { type: 'server_error', message: 'Failed to add the key' } }, 500);
  }
});

/** Load a credential only if it belongs to one of the user's own providers. */
async function ownedCredential(userId: string, id: string) {
  const [row] = await db.select({ cred: providerCredentials, provider: providers })
    .from(providerCredentials)
    .innerJoin(providers, eq(providers.id, providerCredentials.providerId))
    .where(and(eq(providerCredentials.id, id), eq(providers.ownerUserId, userId)))
    .limit(1);
  return row;
}

userPoolRoutes.patch('/keys/:id', async (c) => {
  const user = c.get('user')!;
  const row = await ownedCredential(user.userId, c.req.param('id'));
  if (!row) return c.json({ error: { type: 'not_found', message: 'Key not found' } }, 404);
  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body?.enabled === 'boolean') { updates.enabled = body.enabled; updates.status = body.enabled ? 'active' : 'disabled'; }
  if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 60);
  await db.update(providerCredentials).set(updates).where(eq(providerCredentials.id, row.cred.id));
  return c.json({ data: { id: row.cred.id, ...updates } });
});

userPoolRoutes.delete('/keys/:id', async (c) => {
  const user = c.get('user')!;
  const row = await ownedCredential(user.userId, c.req.param('id'));
  if (!row) return c.json({ error: { type: 'not_found', message: 'Key not found' } }, 404);
  // usage_records keep a reference for analytics, so the key is detached rather than hard-deleted
  // when it has history; otherwise it is removed.
  const [used] = await db.select({ id: usageRecords.id }).from(usageRecords).where(eq(usageRecords.credentialId, row.cred.id)).limit(1);
  if (used) {
    await db.update(providerCredentials).set({ enabled: false, status: 'revoked', encryptedKey: 'removed', iv: 'removed', authTag: 'removed', updatedAt: new Date() })
      .where(eq(providerCredentials.id, row.cred.id));
  } else {
    await db.delete(providerCredentials).where(eq(providerCredentials.id, row.cred.id));
  }
  await logAudit({ actor: `clerk:${user.userId}`, action: 'pool_key.deleted', resourceType: 'credential', resourceId: row.cred.id });
  return c.json({ data: { id: row.cred.id, deleted: true } });
});

userPoolRoutes.put('/strategy', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  if (!isKeyStrategy(body?.keyStrategy)) {
    return c.json({ error: { type: 'validation_error', message: `keyStrategy must be one of: ${KEY_STRATEGIES.join(', ')}` } }, 400);
  }
  const owned = await ownedProviders(user.userId);
  for (const p of owned) {
    await db.update(providers).set({ config: { ...(p.config as object), keyStrategy: body.keyStrategy }, updatedAt: new Date() }).where(eq(providers.id, p.id));
  }
  return c.json({ data: { keyStrategy: body.keyStrategy } });
});

userPoolRoutes.post('/api-keys', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'Pool key';
  const project = await poolProject(user.userId);
  const { key, prefix, hash } = generateApiKey();
  const [row] = await db.insert(apiKeys).values({ projectId: project.id, name, keyPrefix: prefix, keyHash: hash, status: 'active' }).returning();
  await logAudit({ actor: `clerk:${user.userId}`, action: 'pool_api_key.created', resourceType: 'api_key', resourceId: row.id });
  return c.json({ data: { id: row.id, name, key, keyPrefix: prefix }, warning: 'Save this API key now. It will not be shown again.' }, 201);
});

userPoolRoutes.delete('/api-keys/:id', async (c) => {
  const user = c.get('user')!;
  const project = await poolProject(user.userId);
  const [row] = await db.update(apiKeys).set({ status: 'revoked' })
    .where(and(eq(apiKeys.id, c.req.param('id')), eq(apiKeys.projectId, project.id))).returning();
  if (!row) return c.json({ error: { type: 'not_found', message: 'API key not found' } }, 404);
  return c.json({ data: { id: row.id, revoked: true } });
});
