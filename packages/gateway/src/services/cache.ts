import { ChatRequest, ChatResponse } from '../types/index.js';
import { redis } from '../cache/redis.js';
import { db } from '../db/index.js';
import { cacheMetadata } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { logger } from '../middleware/logger.js';

const CACHE_PREFIX = 'cache:response:';
const DEFAULT_TTL = 3600; // 1 hour

export function generateCacheKey(request: ChatRequest): string {
  const keyData = JSON.stringify({
    model: request.model,
    messages: request.messages,
    temperature: request.temperature ?? 1,
    max_tokens: request.max_tokens,
    top_p: request.top_p ?? 1,
    stop: request.stop,
  });
  return crypto.createHash('sha256').update(keyData).digest('hex');
}

export async function getCachedResponse(request: ChatRequest): Promise<ChatResponse | null> {
  try {
    const key = generateCacheKey(request);
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);

    if (!cached) return null;

    // Increment hit count in metadata
    try {
      await db.update(cacheMetadata)
        .set({ hitCount: sql`${cacheMetadata.hitCount} + 1` })
        .where(eq(cacheMetadata.cacheKey, key));
    } catch { /* non-critical */ }

    logger.debug({ cacheKey: key.substring(0, 16) }, 'Cache HIT');
    return JSON.parse(cached as string) as ChatResponse;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cache read error');
    return null;
  }
}

export async function setCachedResponse(
  request: ChatRequest,
  response: ChatResponse,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  try {
    const key = generateCacheKey(request);

    // Store in Redis with TTL
    await redis.set(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify(response),
      'EX',
      ttlSeconds
    );

    // Store metadata in DB
    try {
      await db.insert(cacheMetadata).values({
        cacheKey: key,
        provider: response.model?.split('/')[0] || 'unknown',
        model: response.model || request.model,
        hitCount: 0,
        ttlSeconds,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      }).onConflictDoUpdate({
        target: cacheMetadata.cacheKey,
        set: {
          hitCount: 0,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      });
    } catch { /* non-critical */ }

    logger.debug({ cacheKey: key.substring(0, 16), ttlSeconds }, 'Cache SET');
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cache write error');
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(`${CACHE_PREFIX}${key}`);
    await db.delete(cacheMetadata).where(eq(cacheMetadata.cacheKey, key));
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cache invalidation error');
  }
}
