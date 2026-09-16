import { Hono } from 'hono';
import { getOverallUsageSummary, getRecentRequests, getUsageByProvider, getUsageByModel } from '../../services/usage.js';
import { db } from '../../db/index.js';
import { projects, usageRecords } from '../../db/schema/index.js';
import { eq, count, sum, gte, and } from 'drizzle-orm';
import { logger } from '../../middleware/logger.js';

export const adminAnalyticsRoutes = new Hono();

// Overview stats
adminAnalyticsRoutes.get('/overview', async (c) => {
  try {
    const period = (c.req.query('period') || 'today') as 'today' | 'week' | 'month';

    const todayStats = await getOverallUsageSummary('today');
    const weekStats = await getOverallUsageSummary('week');
    const monthStats = await getOverallUsageSummary('month');

    return c.json({
      data: {
        today: todayStats,
        week: weekStats,
        month: monthStats,
        requestsToday: todayStats.requestCount,
        tokensToday: todayStats.totalTokens,
        cacheHitRate: todayStats.cacheHitRate,
        avgLatencyMs: todayStats.avgLatencyMs,
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get analytics overview');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});

// Usage by provider
adminAnalyticsRoutes.get('/by-provider', async (c) => {
  try {
    const period = (c.req.query('period') || 'today') as 'today' | 'week' | 'month';
    const data = await getUsageByProvider(undefined, period);
    return c.json({ data });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get usage by provider');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});

// Usage by model
adminAnalyticsRoutes.get('/by-model', async (c) => {
  try {
    const period = (c.req.query('period') || 'today') as 'today' | 'week' | 'month';
    const data = await getUsageByModel(undefined, period);
    return c.json({ data });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get usage by model');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});

// Usage by project
adminAnalyticsRoutes.get('/by-project', async (c) => {
  try {
    const allProjects = await db.select().from(projects);
    const period = (c.req.query('period') || 'today') as 'today' | 'week' | 'month';

    const periodStart = new Date();
    if (period === 'today') {
      periodStart.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    const data = await Promise.all(allProjects.map(async (p) => {
      const [stats] = await db.select({
        requestCount: count(),
        totalTokens: sum(usageRecords.totalTokens),
      })
        .from(usageRecords)
        .where(and(
          eq(usageRecords.projectId, p.id),
          gte(usageRecords.createdAt, periodStart)
        ));

      return {
        projectId: p.id,
        projectName: p.name,
        requestCount: stats?.requestCount || 0,
        totalTokens: Number(stats?.totalTokens) || 0,
      };
    }));

    return c.json({ data });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get usage by project');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});

// Recent requests
adminAnalyticsRoutes.get('/recent-requests', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const data = await getRecentRequests(undefined, limit);
    return c.json({ data });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get recent requests');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});
