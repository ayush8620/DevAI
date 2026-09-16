import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  details: jsonb('details').default({}),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  actorIdx: index('audit_logs_actor_idx').on(table.actor),
  actionIdx: index('audit_logs_action_idx').on(table.action),
  resourceTypeIdx: index('audit_logs_resource_type_idx').on(table.resourceType),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));
