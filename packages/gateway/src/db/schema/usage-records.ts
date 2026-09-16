import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { providers } from './providers';
import { providerCredentials } from './provider-credentials';

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  providerId: uuid('provider_id').references(() => providers.id),
  credentialId: uuid('credential_id').references(() => providerCredentials.id),
  requestId: text('request_id').notNull(),
  model: text('model'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  latencyMs: integer('latency_ms'),
  status: integer('status'),
  cacheHit: boolean('cache_hit').default(false),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  projectIdx: index('usage_records_project_id_idx').on(table.projectId),
  providerIdx: index('usage_records_provider_id_idx').on(table.providerId),
  credentialIdx: index('usage_records_credential_id_idx').on(table.credentialId),
  modelIdx: index('usage_records_model_idx').on(table.model),
  createdAtIdx: index('usage_records_created_at_idx').on(table.createdAt),
  statusIdx: index('usage_records_status_idx').on(table.status),
}));
