import { Hono } from 'hono';
import { getAuditLogs } from '../../services/audit.js';

export const adminAuditRoutes = new Hono();

adminAuditRoutes.get('/', async (c) => {
  const logs = await getAuditLogs();
  return c.json(logs);
});
