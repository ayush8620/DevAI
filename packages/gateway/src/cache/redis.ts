import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 100, 2000);
  },
});

redis.on('error', (err) => {
  logger.warn({ err: err.message }, 'Redis connection warning');
});

export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err: any) {
    logger.warn({ err: err.message, key }, 'Redis cacheGet error');
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    if (ttlSeconds) {
      await redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await redis.set(key, value);
    }
  } catch (err: any) {
    logger.warn({ err: err.message, key }, 'Redis cacheSet error');
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err: any) {
    logger.warn({ err: err.message, key }, 'Redis cacheDel error');
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  try {
    const count = await redis.exists(key);
    return count > 0;
  } catch (err: any) {
    logger.warn({ err: err.message, key }, 'Redis cacheExists error');
    return false;
  }
}
