import { Hono } from 'hono';
import { desc, inArray } from 'drizzle-orm';
import type { AppEnv } from '../../types/index.js';
import { db } from '../../db/index.js';
import { usageRecords } from '../../db/schema/index.js';
import { projectIdsOf, startOfToday, usageByDay, usageByModel, usageByProvider, usageSince } from '../../services/admin-usage.js';
import { parsePeriod, periodStart } from '../admin/_util.js';
import { logger } from '../../middleware/logger.js';

/**
 * GET /user/usage?period=today|week|month: the signed-in user's own traffic (their pool
 * project and their hackathon kits). Never includes anybody else's requests.
 */
export const userUsageRoutes = new Hono<AppEnv>();

userUsageRoutes.get('/', async (c) => {
  const user = c.get('user')!;
  const period = parsePeriod(c.req.query('period'), 'week');
  try {
    const ids = await projectIdsOf(user.userId);
    const since = periodStart(period);
    const [summary, today, days, byModel, byProvider, recent] = await Promise.all([
      usageSince(since, ids),
      usageSince(startOfToday(), ids),
      usageByDay(period === 'month' ? 30 : 7, ids),
      usageByModel(since, ids),
      usageByProvider(since, ids),
      ids.length ? db.select({
        requestId: usageRecords.requestId, model: usageRecords.model, status: usageRecords.status, latencyMs: usageRecords.latencyMs,
        totalTokens: usageRecords.totalTokens, cacheHit: usageRecords.cacheHit, createdAt: usageRecords.createdAt,
      }).from(usageRecords).where(inArray(usageRecords.projectId, ids)).orderBy(desc(usageRecords.createdAt)).limit(20) : Promise.resolve([]),
    ]);
    return c.json({
      data: {
        period, summary, today, days, recent,
        byModel,
        byProvider: byProvider.map(p => ({ name: p.name, requestCount: p.requestCount, totalTokens: p.totalTokens, errors: p.errors })),
      },
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to load user usage');
    return c.json({ error: { type: 'server_error', message: 'Could not load your usage' } }, 500);
  }
});
