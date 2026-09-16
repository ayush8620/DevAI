import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { providers } from './providers';
import { providerCredentials } from './provider-credentials';

export const healthChecks = pgTable('health_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').references(() => providers.id).notNull(),
  credentialId: uuid('credential_id').references(() => providerCredentials.id),
  status: text('status').notNull(),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
}, (table) => ({
  providerIdx: index('health_checks_provider_id_idx').on(table.providerId),
  checkedAtIdx: index('health_checks_checked_at_idx').on(table.checkedAt),
}));
