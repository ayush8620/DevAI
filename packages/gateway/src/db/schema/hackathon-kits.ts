import { pgTable, uuid, text, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects';

/**
 * Hackathon kit: temporary team API keys (on the kit's own project) with a request cap,
 * a token (spend) cap, an expiry, an optional team size and an allowed-model list.
 * Usage counters live in Redis (kit:<id>:requests / kit:<id>:tokens).
 */
export const hackathonKits = pgTable('hackathon_kits', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: text('owner_user_id').notNull(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  name: text('name').notNull(),
  /** Random slug for the public kit page (/kit/<token>); not an API credential */
  shareToken: text('share_token').notNull(),
  requestCap: integer('request_cap'),
  tokenCap: integer('token_cap'),
  maxTeamSize: integer('max_team_size'),
  keyCount: integer('key_count').notNull().default(1),
  allowedModels: jsonb('allowed_models').notNull().default([]).$type<string[]>(),
  expiresAt: timestamp('expires_at').notNull(),
  status: text('status').notNull().default('active').$type<'active' | 'revoked'>(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shareIdx: uniqueIndex('hackathon_kits_share_token_idx').on(table.shareToken),
  ownerIdx: index('hackathon_kits_owner_user_id_idx').on(table.ownerUserId),
  projectIdx: index('hackathon_kits_project_id_idx').on(table.projectId),
}));
