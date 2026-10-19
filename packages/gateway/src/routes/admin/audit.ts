import { Hono } from 'hono';
import { selectDistinct } from '../../services/audit-meta.js';
import { getAuditLogs } from '../../services/audit.js';
import { clampInt } from '../../billing/admin.js';

/**
 * GET /admin/audit-logs?actor=&action=&resourceType=&resourceId=&from=&to=&q=&limit=&offset=
 * action may be a prefix ending in "." (e.g. "user."). Returns { data, limit, offset, hasMore }.
 */
export const adminAuditRoutes = new Hono();

const date = (v: string | undefined) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
};

adminAuditRoutes.get('/', async (c) => {
  const limit = clampInt(c.req.query('limit'), 50, 1, 200);
  const offset = clampInt(c.req.query('offset'), 0, 0, 1_000_000);
  const q = (k: string) => (c.req.query(k) || '').trim().slice(0, 200) || undefined;
  const rows = await getAuditLogs({
    actor: q('actor'), action: q('action'), resourceType: q('resourceType'), resourceId: q('resourceId'),
    from: date(c.req.query('from')), to: date(c.req.query('to')), q: q('q'),
    limit: limit + 1, offset,
  });
  return c.json({ data: rows.slice(0, limit), limit, offset, hasMore: rows.length > limit });
});

/** Distinct actions and resource types, for the filter dropdowns. */
adminAuditRoutes.get('/facets', async (c) => c.json({ data: await selectDistinct() }));
