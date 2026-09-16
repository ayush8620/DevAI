import { relations } from 'drizzle-orm';
import { apiKeys } from './api-keys';
import { projects } from './projects';

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.projectId],
    references: [projects.id],
  }),
}));
