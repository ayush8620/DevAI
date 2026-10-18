import { Hono } from 'hono';
import type { AppEnv } from '../../types/index.js';

/** Who is calling the admin API (lets the dashboard show the signed-in admin). */
export const adminMeRoutes = new Hono<AppEnv>();

adminMeRoutes.get('/', (c) => {
  const a = c.get('adminAuth');
  return c.json({ data: a?.method === 'clerk'
    ? { method: 'clerk', userId: a.userId, email: a.email ?? null }
    : { method: 'admin_key' } });
});
