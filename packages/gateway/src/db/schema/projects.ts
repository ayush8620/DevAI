import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  // Per-app routing defaults (see RoutingConfigSchema in types/index.ts)
  routing: jsonb('routing').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
