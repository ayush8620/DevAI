import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull().$type<'openai' | 'anthropic' | 'google' | 'groq' | 'ollama'>(),
  name: text('name').notNull(),
  baseUrl: text('base_url'),
  status: text('status').default('active'),
  config: jsonb('config').default({}),
  // Set for a signed-in user's personal key pool (Clerk user id); null = shared, admin-managed provider.
  ownerUserId: text('owner_user_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  typeIdx: index('providers_type_idx').on(table.type),
  ownerIdx: index('providers_owner_user_id_idx').on(table.ownerUserId),
}));
