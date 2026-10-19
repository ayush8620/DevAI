import { Hono } from 'hono';
import type { AppEnv } from '../../types/index.js';
import { summarizeSubscriptions } from '../../billing/admin.js';
import { planFromBilling } from '../../billing/plans.js';
import { allUsers, userDirectory } from '../../services/user-directory.js';
import { suspendedCount } from '../../services/accounts.js';
import { startOfToday, usageByDay, usageSince } from '../../services/admin-usage.js';
import { DAY_MS, serverError } from './_util.js';
import { logger } from '../../middleware/logger.js';

/**
 * GET /admin/overview: users, subscriptions by plan, an MRR estimate (renewing Razorpay
 * subscriptions only), requests/tokens/error rate for today and the last 7 days, recent signups.
 */
export const adminOverviewRoutes = new Hono<AppEnv>();

adminOverviewRoutes.get('/', async (c) => {
  try {
    const dir = userDirectory();
    const warnings: string[] = [];
    const [today, week, days, suspended] = await Promise.all([
      usageSince(startOfToday()),
      usageSince(new Date(Date.now() - 7 * DAY_MS)),
      usageByDay(7),
      suspendedCount(),
    ]);

    let totalUsers: number | null = null;
    let recent: any[] = [];
    let subs = summarizeSubscriptions([]);
    try {
      const [page, everyone] = await Promise.all([dir.list({ limit: 8, offset: 0 }), allUsers()]);
      totalUsers = page.total;
      recent = page.users.map(u => ({ id: u.id, email: u.email, name: u.name, imageUrl: u.imageUrl, createdAt: u.createdAt, plan: planFromBilling(u.billing) }));
      subs = summarizeSubscriptions(everyone);
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Admin overview: user directory failed');
      warnings.push('Could not load users from Clerk. Check CLERK_SECRET_KEY on the gateway.');
    }
    if (dir.source === 'database') warnings.push('CLERK_SECRET_KEY is not set on the gateway, so users come from the database (no emails or plans).');

    return c.json({
      data: {
        users: { total: totalUsers, suspended, recent, source: dir.source },
        subscriptions: subs,
        mrrEstimatePaise: subs.mrrPaise,
        usage: { today, week, days },
        warnings,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return serverError(c, err, 'load the overview');
  }
});
