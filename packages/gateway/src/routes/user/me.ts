import { Hono } from 'hono';
import type { AppEnv } from '../../types/index.js';

/** GET /user/me: the signed-in user's plan and whether they are a gateway admin (shows the Admin link). */
export const userMeRoutes = new Hono<AppEnv>();

userMeRoutes.get('/', (c) => {
  const u = c.get('user')!;
  return c.json({ data: { userId: u.userId, plan: u.plan, isAdmin: u.isAdmin, status: 'active' } });
});
