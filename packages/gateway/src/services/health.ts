import { db } from '../db/index.js';
import { providers, providerCredentials, healthChecks } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { createProvider } from '../providers/registry.js';
import { decrypt } from '../crypto/encryption.js';
import { redis } from '../cache/redis.js';
import { logger } from '../middleware/logger.js';

export interface HealthResult {
  providerId: string;
  providerName: string;
  providerType: string;
  credentialId?: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'rate_limited' | 'disabled';
  latencyMs: number;
  error?: string;
}

export async function checkProviderHealth(providerId: string): Promise<HealthResult> {
  const [providerDef] = await db.select().from(providers).where(eq(providers.id, providerId));
  if (!providerDef) {
    return { providerId, providerName: 'Unknown', providerType: 'unknown', status: 'unhealthy', latencyMs: 0, error: 'Provider not found' };
  }

  // Get first active credential for this provider
  const creds = await db.select().from(providerCredentials)
    .where(and(eq(providerCredentials.providerId, providerId), eq(providerCredentials.enabled, true)))
    .limit(1);

  if (!creds.length) {
    return { providerId, providerName: providerDef.name, providerType: providerDef.type, status: 'disabled', latencyMs: 0, error: 'No active credentials' };
  }

  const cred = creds[0];
  const decryptedKey = decrypt({ ciphertext: cred.encryptedKey, iv: cred.iv, authTag: cred.authTag });
  const provider = createProvider(providerDef.type, providerDef.id, providerDef.name, providerDef.baseUrl || undefined);

  try {
    const result = await provider.healthCheck(decryptedKey);
    const status = result.healthy ? (result.latencyMs > 5000 ? 'degraded' : 'healthy') : 'unhealthy';

    // Cache health status in Redis (5 min TTL)
    await redis.set(`health:${providerId}`, status, 'EX', 300);

    // Store in DB
    await db.insert(healthChecks).values({
      providerId,
      credentialId: cred.id,
      status,
      latencyMs: result.latencyMs,
    });

    return { providerId, providerName: providerDef.name, providerType: providerDef.type, credentialId: cred.id, status, latencyMs: result.latencyMs };
  } catch (err: any) {
    await redis.set(`health:${providerId}`, 'unhealthy', 'EX', 300);

    await db.insert(healthChecks).values({
      providerId,
      credentialId: cred.id,
      status: 'unhealthy',
      latencyMs: 0,
      error: err.message,
    });

    return { providerId, providerName: providerDef.name, providerType: providerDef.type, status: 'unhealthy', latencyMs: 0, error: err.message };
  }
}

export async function checkAllProviders(): Promise<HealthResult[]> {
  const allProviders = await db.select().from(providers).where(eq(providers.status, 'active'));
  const results: HealthResult[] = [];

  for (const p of allProviders) {
    try {
      const result = await checkProviderHealth(p.id);
      results.push(result);
    } catch (err: any) {
      results.push({
        providerId: p.id,
        providerName: p.name,
        providerType: p.type,
        status: 'unhealthy',
        latencyMs: 0,
        error: err.message,
      });
    }
  }

  return results;
}

export async function getHealthStatus() {
  const providerResults = await checkAllProviders();

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
    status: redisStatus === 'unhealthy' || dbStatus === 'unhealthy'
      ? 'unhealthy'
      : anyUnhealthy
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
      const unhealthy = results.filter(r => r.status === 'unhealthy');
      if (unhealthy.length > 0) {
        logger.warn({ unhealthy: unhealthy.map(r => r.providerName) }, 'Unhealthy providers detected');
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Health check worker error');
    }
  }, intervalMs);
}
