import { Hono } from 'hono';
import type { AppEnv } from '../../types/index.js';
import { clampInt, subscriptionRow, summarizeSubscriptions } from '../../billing/admin.js';
import { allUsers, userDirectory } from '../../services/user-directory.js';
import { serverError } from './_util.js';

/**
 * GET /admin/subscriptions?status=&plan=&source=&page=&limit=
 * Every user with a stored billing record (Clerk publicMetadata.billing), newest change first.
 * status: active | authenticated | pending | halted | cancelled | completed | expired
 * source: razorpay | comp | legacy
 */
export const adminSubscriptionRoutes = new Hono<AppEnv>();

adminSubscriptionRoutes.get('/', async (c) => {
  const status = c.req.query('status') || '';
  const plan = c.req.query('plan') || '';
  const source = c.req.query('source') || '';
  const limit = clampInt(c.req.query('limit'), 50, 1, 200);
  const page = clampInt(c.req.query('page'), 1, 1, 10_000);
  try {
    const users = await allUsers();
    const now = new Date();
    const rows = users
      .map(u => ({ u, s: subscriptionRow(u.billing, now) }))
      .filter((r): r is { u: typeof r.u; s: NonNullable<typeof r.s> } => r.s !== null)
      .filter(r => (!status || r.s.status === status) && (!plan || r.s.plan === plan) && (!source || r.s.source === source))
      .sort((a, b) => String(b.s.updatedAt ?? '').localeCompare(String(a.s.updatedAt ?? '')))
      .map(r => ({ userId: r.u.id, email: r.u.email, name: r.u.name, ...r.s }));
    return c.json({
      data: rows.slice((page - 1) * limit, page * limit),
      total: rows.length, page, limit,
      summary: summarizeSubscriptions(users, now),
      source: userDirectory().source,
    });
  } catch (err) {
    return serverError(c, err, 'list subscriptions');
  }
});
