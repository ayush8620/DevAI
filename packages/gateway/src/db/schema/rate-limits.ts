import { pgTable, uuid, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { providerCredentials } from './provider-credentials';

export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  credentialId: uuid('credential_id').references(() => providerCredentials.id).notNull(),
  windowStart: timestamp('window_start').notNull(),
  requestCount: integer('request_count').default(0),
  tokenCount: integer('token_count').default(0),
}, (table) => ({
  credentialIdx: index('rate_limits_credential_id_idx').on(table.credentialId),
}));
