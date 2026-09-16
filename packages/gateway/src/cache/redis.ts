import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';

export const redis = new Redis(config.REDIS_URL);

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

export async function cacheGet(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds) {
    await redis.set(key, value, 'EX', ttlSeconds);
  } else {
    await redis.set(key, value);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheExists(key: string): Promise<boolean> {
  const count = await redis.exists(key);
  return count > 0;
}
