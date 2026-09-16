import { Hono } from 'hono';
import { getUsageSummary } from '../../services/usage.js';
import { AppEnv } from '../../types/index.js';

export const usageRoutes = new Hono<AppEnv>();

usageRoutes.get('/', async (c) => {
  const projectId = (c.get('projectId') as string) || 'default';
  const period = (c.req.query('period') as 'today' | 'week' | 'month') || 'today';
  const summary = await getUsageSummary(projectId, period);
  return c.json(summary);
});
