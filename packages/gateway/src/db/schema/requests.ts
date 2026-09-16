import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const requests = pgTable('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: text('request_id').unique().notNull(),
  projectId: uuid('project_id').references(() => projects.id),
  providerId: uuid('provider_id'),
  credentialId: uuid('credential_id'),
  model: text('model'),
  status: integer('status'),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  requestIdIdx: index('requests_request_id_idx').on(table.requestId),
  projectIdx: index('requests_project_id_idx').on(table.projectId),
  createdAtIdx: index('requests_created_at_idx').on(table.createdAt),
}));
