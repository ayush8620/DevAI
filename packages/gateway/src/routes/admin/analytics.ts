import { Hono } from 'hono';
import { getOverallUsageSummary, getRecentRequests } from '../../services/usage.js';
import { topUsers, usageByDay, usageByModel, usageByProvider } from '../../services/admin-usage.js';
import { clampInt } from '../../billing/admin.js';
import { userDirectory } from '../../services/user-directory.js';
import { parsePeriod, periodStart } from './_util.js';
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
    // Provider names included; users' own providers are merged by name.
    const data = await usageByProvider(periodStart(parsePeriod(c.req.query('period'), 'today')));
    return c.json({ data });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get usage by provider');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});

// Usage by model
adminAnalyticsRoutes.get('/by-model', async (c) => {
  try {
    const data = await usageByModel(periodStart(parsePeriod(c.req.query('period'), 'today')));
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

// Requests, tokens and errors per day (?days=1-90, default 30)
adminAnalyticsRoutes.get('/by-day', async (c) => {
  try {
    return c.json({ data: await usageByDay(clampInt(c.req.query('days'), 30, 1, 90)) });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get usage by day');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});

// Heaviest users (?period=today|week|month, ?limit=1-50)
adminAnalyticsRoutes.get('/top-users', async (c) => {
  try {
    const rows = await topUsers(periodStart(parsePeriod(c.req.query('period'), 'week')), clampInt(c.req.query('limit'), 10, 1, 50));
    const emails = new Map<string, string | null>();
    if (rows.length) {
      try { for (const u of await userDirectory().byIds(rows.map(r => r.userId))) emails.set(u.id, u.email); } catch { /* emails optional */ }
    }
    return c.json({ data: rows.map(r => ({ ...r, email: emails.get(r.userId) ?? null })) });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get top users');
    return c.json({ error: { type: 'server_error', message: 'Failed to get analytics' } }, 500);
  }
});
