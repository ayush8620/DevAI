import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { providers } from './providers';

export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').references(() => providers.id).notNull(),
  modelId: text('model_id').notNull(),
  displayName: text('display_name').notNull(),
  capabilities: jsonb('capabilities').default({}),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  providerModelIdx: index('models_provider_id_model_id_idx').on(table.providerId, table.modelId),
}));
