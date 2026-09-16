import { db } from '../db/index.js';
import { providerCredentials } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { redis } from '../cache/redis.js';
import { logger } from '../middleware/logger.js';

const QUOTA_CACHE_PREFIX = 'quota:';
const QUOTA_CACHE_TTL = 60; // 1 minute cache

export async function checkQuota(credentialId: string): Promise<boolean> {
  try {
    // Fast path: check Redis cache
    const cached = await redis.get(`${QUOTA_CACHE_PREFIX}${credentialId}`);
    if (cached === 'exceeded') return false;

    // Slow path: check DB
    const [cred] = await db.select({
      quotaLimit: providerCredentials.quotaLimit,
      quotaUsed: providerCredentials.quotaUsed,
      quotaResetAt: providerCredentials.quotaResetAt,
    })
      .from(providerCredentials)
      .where(eq(providerCredentials.id, credentialId));

    if (!cred) return false;

    // No quota limit set = unlimited
    if (!cred.quotaLimit) return true;

    // Check if quota reset is due
    if (cred.quotaResetAt && new Date(cred.quotaResetAt) <= new Date()) {
      await resetQuota(credentialId);
      return true;
    }

    const remaining = cred.quotaLimit - (cred.quotaUsed || 0);
    if (remaining <= 0) {
      await redis.set(`${QUOTA_CACHE_PREFIX}${credentialId}`, 'exceeded', 'EX', QUOTA_CACHE_TTL);
      return false;
    }

    return true;
  } catch (err: any) {
    logger.error({ err: err.message, credentialId }, 'Quota check error');
    return true; // Fail open
  }
}

export async function consumeQuota(credentialId: string, tokens: number): Promise<void> {
  try {
    await db.update(providerCredentials)
      .set({
        quotaUsed: sql`COALESCE(${providerCredentials.quotaUsed}, 0) + ${tokens}`,
        updatedAt: new Date(),
      })
      .where(eq(providerCredentials.id, credentialId));

    // Invalidate cache
    await redis.del(`${QUOTA_CACHE_PREFIX}${credentialId}`);
  } catch (err: any) {
    logger.error({ err: err.message, credentialId, tokens }, 'Quota consume error');
  }
}

export async function resetQuota(credentialId: string): Promise<void> {
  try {
    // Reset quota and set next reset time (30 days from now)
    const nextReset = new Date();
    nextReset.setDate(nextReset.getDate() + 30);

    await db.update(providerCredentials)
      .set({
        quotaUsed: 0,
        quotaResetAt: nextReset,
        updatedAt: new Date(),
      })
      .where(eq(providerCredentials.id, credentialId));

    await redis.del(`${QUOTA_CACHE_PREFIX}${credentialId}`);
    logger.info({ credentialId }, 'Quota reset');
  } catch (err: any) {
    logger.error({ err: err.message, credentialId }, 'Quota reset error');
  }
}
