import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { hackathonKits } from '../../db/schema/index.js';
import { kitUsage } from '../../engine/kit-limits.js';
import { kitStatus } from '../user/kits.js';

/** Public kit page data (GET /public/kits/:shareToken): name, status, expiry, caps and remaining quota. No keys. */
export const publicKitRoutes = new Hono();

publicKitRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!/^[\w-]{8,64}$/.test(token)) return c.json({ error: { type: 'not_found', message: 'Kit not found' } }, 404);
  const [kit] = await db.select().from(hackathonKits).where(eq(hackathonKits.shareToken, token)).limit(1);
  if (!kit) return c.json({ error: { type: 'not_found', message: 'Kit not found' } }, 404);
  const usage = await kitUsage(kit);
  return c.json({
    data: {
      name: kit.name, status: kitStatus(kit), expiresAt: kit.expiresAt,
      requestCap: kit.requestCap, tokenCap: kit.tokenCap, maxTeamSize: kit.maxTeamSize, keyCount: kit.keyCount,
      allowedModels: kit.allowedModels ?? [], usage,
    },
  });
});
