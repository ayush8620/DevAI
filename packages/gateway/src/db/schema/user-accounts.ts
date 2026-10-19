import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Gateway-side state for a Clerk user that the admin panel manages (drizzle/0004_admin_panel.sql).
 * Users themselves live in Clerk; a row exists only once an admin has acted on the user.
 * status 'suspended' makes the gateway answer 403 to the user's /user/* calls and to /v1 calls
 * made with any of their pool or kit API keys.
 */
export const userAccounts = pgTable('user_accounts', {
  userId: text('user_id').primaryKey(),
  status: text('status').notNull().default('active').$type<'active' | 'suspended'>(),
  suspendedReason: text('suspended_reason'),
  suspendedAt: timestamp('suspended_at'),
  suspendedBy: text('suspended_by'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  statusIdx: index('user_accounts_status_idx').on(t.status),
}));
