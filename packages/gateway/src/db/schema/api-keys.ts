import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  keyHash: text('key_hash').notNull(),
  name: text('name').notNull(),
  status: text('status').default('active'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  prefixIdx: index('api_keys_prefix_idx').on(table.keyPrefix),
  projectIdx: index('api_keys_project_id_idx').on(table.projectId),
}));
