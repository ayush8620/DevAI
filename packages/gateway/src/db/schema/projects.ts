import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  // Per-app routing defaults (see RoutingConfigSchema in types/index.ts)
  routing: jsonb('routing').default({}),
  /** app = admin project (shared providers); pool = a user's personal key pool; kit = a hackathon kit */
  kind: text('kind').notNull().default('app').$type<'app' | 'pool' | 'kit'>(),
  /** Clerk user id for pool and kit projects; their requests use only that user's pooled keys */
  ownerUserId: text('owner_user_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index('projects_owner_user_id_idx').on(table.ownerUserId),
}));
