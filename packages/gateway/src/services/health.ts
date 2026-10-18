import { db } from '../db/index.js';
import { providers, providerCredentials, healthChecks } from '../db/schema/index.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { createProvider } from '../providers/registry.js';
import { decrypt } from '../crypto/encryption.js';
import { redis, cacheSet } from '../cache/redis.js';
import { logger } from '../middleware/logger.js';
import { maskSecret } from '../engine/keys.js';

export interface HealthResult {
  providerId: string;
  providerName: string;
  providerType: string;
  credentialId?: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'rate_limited' | 'disabled';
  latencyMs: number;
  error?: string;
}

export interface KeyHealth {
  credentialId: string;
  name: string;
  key: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

/**
 * Check every enabled key of a provider (in parallel). The provider is healthy if at
 * least one key works; a bad key only marks that key unhealthy, so routing keeps
 * using the provider's other keys.
 */
export async function checkProviderHealth(providerId: string): Promise<HealthResult & { keys?: KeyHealth[] }> {
  const [providerDef] = await db.select().from(providers).where(eq(providers.id, providerId));
  if (!providerDef) {
    return { providerId, providerName: 'Unknown', providerType: 'unknown', status: 'unhealthy', latencyMs: 0, error: 'Provider not found' };
  }

  const creds = await db.select().from(providerCredentials)
    .where(and(eq(providerCredentials.providerId, providerId), eq(providerCredentials.enabled, true)));

  if (!creds.length) {
    return { providerId, providerName: providerDef.name, providerType: providerDef.type, status: 'disabled', latencyMs: 0, error: 'No active credentials' };
  }

  const keys: KeyHealth[] = await Promise.all(creds.map(cred => checkCredentialHealth(providerDef, cred)));

  const working = keys.filter(k => k.status !== 'unhealthy');
  const status: HealthResult['status'] = !working.length ? 'unhealthy' : working.some(k => k.status === 'healthy') ? 'healthy' : 'degraded';
  await cacheSet(`health:${providerId}`, status, 300);
  const best = working.sort((a, b) => a.latencyMs - b.latencyMs)[0];
  return {
    providerId, providerName: providerDef.name, providerType: providerDef.type,
    credentialId: best?.credentialId, status, latencyMs: best?.latencyMs ?? 0,
    error: working.length ? undefined : keys[0]?.error,
    keys,
  };
}

type ProviderRow = typeof providers.$inferSelect;
type CredentialRow = typeof providerCredentials.$inferSelect;

/**
 * Test one key with a cheap, authenticated call (list models; no tokens spent) and record
 * the result: routing skips a key that failed its last check for 5 minutes.
 */
export async function checkCredentialHealth(p: ProviderRow, cred: CredentialRow): Promise<KeyHealth> {
  let apiKey = '';
  let result: KeyHealth;
  try {
    apiKey = decrypt({ ciphertext: cred.encryptedKey, iv: cred.iv, authTag: cred.authTag });
    const r = await testKey(p, apiKey);
    const status = r.healthy ? (r.latencyMs > 5000 ? 'degraded' : 'healthy') : 'unhealthy';
    result = { credentialId: cred.id, name: cred.name, key: maskSecret(apiKey), status, latencyMs: r.latencyMs, error: r.healthy ? undefined : (r.error || 'health check failed') };
  } catch (err: any) {
    result = { credentialId: cred.id, name: cred.name, key: apiKey ? maskSecret(apiKey) : '••••', status: 'unhealthy', latencyMs: 0, error: String(err?.message || err).slice(0, 200) };
  }
  await cacheSet(`health:key:${cred.id}`, result.status, 300).catch(() => {});
  await db.insert(healthChecks).values({
    providerId: p.id, credentialId: cred.id, status: result.status, latencyMs: result.latencyMs, error: result.error,
  }).catch(() => {});
  return result;
}

async function testKey(p: ProviderRow, apiKey: string): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  // OpenRouter's model list is public, so it would accept any key: check the key itself.
  if (p.baseUrl && /openrouter\.ai/i.test(p.baseUrl)) {
    const start = Date.now();
    try {
      const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/key`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) });
      return { healthy: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `OpenRouter rejected the key (${res.status})` };
    } catch (err: any) {
      return { healthy: false, latencyMs: Date.now() - start, error: String(err?.message || err).slice(0, 200) };
    }
  }
  const provider = createProvider(p.type, p.id, p.name, p.baseUrl || undefined);
  const r = await provider.healthCheck(apiKey);
  return { ...r, error: r.healthy ? undefined : `${p.name} rejected the key or did not answer` };
}

export async function checkAllProviders(): Promise<HealthResult[]> {
  // Shared providers only: users' pooled keys are not health-checked in the background
  // (that would spend their free quota); routing cools them down on real failures instead.
  const allProviders = await db.select().from(providers).where(and(eq(providers.status, 'active'), isNull(providers.ownerUserId)));
  return Promise.all(allProviders.map(async (p): Promise<HealthResult> => {
    try {
      return await checkProviderHealth(p.id);
    } catch (err: any) {
      return { providerId: p.id, providerName: p.name, providerType: p.type, status: 'unhealthy', latencyMs: 0, error: err.message };
    }
  }));
}

// The public /v1/health endpoint never calls a provider itself: it reports the gateway,
// database and Redis, plus the last background check of the shared providers if there are
// any. DevAI is bring-your-own-key, so having no shared provider is normal and healthy.
let lastProviderCheck: { at: number; results: HealthResult[] } | null = null;

export async function getHealthStatus() {
  const providerResults: HealthResult[] = lastProviderCheck?.results ?? [];

  // Check Redis
  let redisStatus = 'healthy';
  try {
    await redis.ping();
  } catch {
    redisStatus = 'unhealthy';
  }

  // Check Database
  let dbStatus = 'healthy';
  try {
    await db.select({ id: providers.id }).from(providers).limit(1);
  } catch {
    dbStatus = 'unhealthy';
  }

  return {
    // Redis is optional (cache/cooldowns fall back to memory), so it only degrades the gateway.
    // Provider keys belong to users and are checked per user in the dashboard, so they never
    // change the gateway status.
    status: dbStatus === 'unhealthy' ? 'unhealthy' : redisStatus === 'unhealthy' ? 'degraded' : 'healthy',
    gateway: 'healthy',
    database: dbStatus,
    redis: redisStatus,
    byok: true,
    providers: providerResults.map(r => ({
      id: r.providerId,
      name: r.providerName,
      type: r.providerType,
      status: r.status,
      latencyMs: r.latencyMs,
      // Public endpoint: key counts only, never key names, hints or error text
      keys: (r as any).keys ? { total: (r as any).keys.length, healthy: (r as any).keys.filter((k: KeyHealth) => k.status !== 'unhealthy').length } : undefined,
    })),
    providers_checked_at: lastProviderCheck ? new Date(lastProviderCheck.at).toISOString() : null,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

export function startHealthCheckWorker(intervalMs: number): void {
  logger.info({ intervalMs }, 'Starting health check worker');

  // Initial check after 10s
  setTimeout(async () => {
    try {
      const results = await checkAllProviders();
      lastProviderCheck = { at: Date.now(), results };
      logger.info({ providers: results.length }, 'Initial health check complete');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Initial health check failed');
    }
  }, 10000);

  // Periodic checks
  setInterval(async () => {
    try {
      const results = await checkAllProviders();
      lastProviderCheck = { at: Date.now(), results };
      const unhealthy = results.filter(r => r.status === 'unhealthy');
      if (unhealthy.length > 0) {
        logger.warn({ unhealthy: unhealthy.map(r => r.providerName) }, 'Unhealthy providers detected');
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Health check worker error');
    }
  }, intervalMs);
}
