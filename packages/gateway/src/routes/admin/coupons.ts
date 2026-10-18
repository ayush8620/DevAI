import { Hono } from 'hono';
import { adminActor } from '../../auth/admin.js';
import { parseCouponInput } from '../../billing/coupons.js';
import { confirmRedemption, createCoupon, listCoupons, updateCoupon } from '../../services/coupons.js';
import { logAudit } from '../../services/audit.js';
import { logger } from '../../middleware/logger.js';
import type { AppEnv } from '../../types/index.js';

/** Admin: create, list and disable promo codes (ADMIN_API_KEY or an allowlisted Clerk admin). */
export const adminCouponRoutes = new Hono<AppEnv>();

adminCouponRoutes.get('/', async (c) => c.json({ data: await listCoupons() }));

adminCouponRoutes.post('/', async (c) => {
  const parsed = parseCouponInput(await c.req.json().catch(() => ({})));
  if (!parsed.ok) return c.json({ error: { type: 'validation_error', message: parsed.message } }, 400);
  try {
    const row = await createCoupon(parsed.value, adminActor(c as any));
    await logAudit({ actor: adminActor(c as any), action: 'coupon.created', resourceType: 'coupon', resourceId: row.id, details: { code: row.code } });
    return c.json({ data: row }, 201);
  } catch (err: any) {
    const code = err?.code ?? err?.cause?.code;
    if (code === '23505') return c.json({ error: { type: 'conflict', message: 'A code with this name already exists' } }, 409);
    logger.error({ err: err?.message }, 'Coupon create failed');
    return c.json({ error: { type: 'server_error', message: 'Could not create the code' } }, 500);
  }
});

adminCouponRoutes.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any;
  const patch: Parameters<typeof updateCoupon>[1] = {};
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') return c.json({ error: { type: 'validation_error', message: 'status must be active or disabled' } }, 400);
    patch.status = body.status;
  }
  if (body.expiresAt !== undefined) {
    const d = body.expiresAt === null ? null : new Date(body.expiresAt);
    if (d && !Number.isFinite(d.getTime())) return c.json({ error: { type: 'validation_error', message: 'expiresAt must be a date' } }, 400);
    patch.expiresAt = d;
  }
  if (body.maxRedemptions !== undefined) {
    const n = body.maxRedemptions === null ? null : Number(body.maxRedemptions);
    if (n !== null && !(Number.isInteger(n) && n >= 1)) return c.json({ error: { type: 'validation_error', message: 'maxRedemptions must be a positive whole number' } }, 400);
    patch.maxRedemptions = n;
  }
  const row = await updateCoupon(c.req.param('id'), patch).catch(() => null);
  if (!row) return c.json({ error: { type: 'not_found', message: 'Code not found' } }, 404);
  await logAudit({ actor: adminActor(c as any), action: 'coupon.updated', resourceType: 'coupon', resourceId: row.id, details: patch as any });
  return c.json({ data: row });
});

/** Used by the dashboard's Razorpay webhook (GATEWAY_ADMIN_API_KEY) to confirm a paid redemption. */
adminCouponRoutes.post('/redemptions/:id/confirm', async (c) => {
  const { subscriptionId } = await c.req.json().catch(() => ({})) as any;
  if (typeof subscriptionId !== 'string' || !subscriptionId.startsWith('sub_')) return c.json({ error: { type: 'validation_error', message: 'subscriptionId is required' } }, 400);
  const ok = await confirmRedemption(c.req.param('id'), subscriptionId, null).catch(() => false);
  return ok ? c.json({ data: { ok: true } }) : c.json({ error: { type: 'not_found', message: 'Redemption not found' } }, 404);
});
