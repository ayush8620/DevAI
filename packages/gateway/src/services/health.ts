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

  const provider = createProvider(providerDef.type, providerDef.id, providerDef.name, providerDef.baseUrl || undefined);
  const keys: KeyHealth[] = await Promise.all(creds.map(async (cred): Promise<KeyHealth> => {
    let apiKey = '';
    try {
      apiKey = decrypt({ ciphertext: cred.encryptedKey, iv: cred.iv, authTag: cred.authTag });
      const result = await provider.healthCheck(apiKey);
      const status = result.healthy ? (result.latencyMs > 5000 ? 'degraded' : 'healthy') : 'unhealthy';
      return { credentialId: cred.id, name: cred.name, key: maskSecret(apiKey), status, latencyMs: result.latencyMs, error: result.healthy ? undefined : 'health check failed' };
    } catch (err: any) {
      return { credentialId: cred.id, name: cred.name, key: maskSecret(apiKey), status: 'unhealthy', latencyMs: 0, error: String(err?.message || err).slice(0, 200) };
    }
  }));

  for (const k of keys) {
    await cacheSet(`health:key:${k.credentialId}`, k.status, 300);
    await db.insert(healthChecks).values({
      providerId, credentialId: k.credentialId, status: k.status, latencyMs: k.latencyMs, error: k.error,
    }).catch(() => {});
  }

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

// The public /v1/health endpoint reuses recent provider checks instead of calling every provider on each hit.
let lastProviderCheck: { at: number; results: HealthResult[] } | null = null;
const PUBLIC_HEALTH_TTL_MS = 30000;

export async function getHealthStatus() {
  let providerResults: HealthResult[];
  if (lastProviderCheck && Date.now() - lastProviderCheck.at < PUBLIC_HEALTH_TTL_MS) {
    providerResults = lastProviderCheck.results;
  } else {
    providerResults = await checkAllProviders();
    lastProviderCheck = { at: Date.now(), results: providerResults };
  }

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
    await db.select().from(providers).limit(1);
  } catch {
    dbStatus = 'unhealthy';
  }

  const allHealthy = providerResults.every(r => r.status === 'healthy');
  const anyUnhealthy = providerResults.some(r => r.status === 'unhealthy');

  return {
    // Redis is optional (cache/cooldowns fall back to memory), so it only degrades the gateway
    status: dbStatus === 'unhealthy'
      ? 'unhealthy'
      : redisStatus === 'unhealthy' || anyUnhealthy
        ? 'degraded'
        : allHealthy
          ? 'healthy'
          : 'degraded',
    providers: providerResults.map(r => ({
      id: r.providerId,
      name: r.providerName,
      type: r.providerType,
      status: r.status,
      latencyMs: r.latencyMs,
      error: r.error,
      // Public endpoint: key counts only, never key names or hints
      keys: (r as any).keys ? { total: (r as any).keys.length, healthy: (r as any).keys.filter((k: KeyHealth) => k.status !== 'unhealthy').length } : undefined,
    })),
    redis: redisStatus,
    database: dbStatus,
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
