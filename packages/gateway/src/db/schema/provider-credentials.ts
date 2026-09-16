import { pgTable, uuid, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { providers } from './providers';

export const providerCredentials = pgTable('provider_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').references(() => providers.id).notNull(),
  name: text('name').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  enabled: boolean('enabled').default(true),
  status: text('status').default('active'),
  quotaLimit: integer('quota_limit'),
  quotaUsed: integer('quota_used').default(0),
  quotaResetAt: timestamp('quota_reset_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  providerIdx: index('provider_credentials_provider_id_idx').on(table.providerId),
  statusIdx: index('provider_credentials_status_idx').on(table.status),
}));
