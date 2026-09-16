import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const cacheMetadata = pgTable('cache_metadata', {
  cacheKey: text('cache_key').primaryKey(),
  provider: text('provider'),
  model: text('model'),
  hitCount: integer('hit_count').default(0),
  ttlSeconds: integer('ttl_seconds'),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
});
