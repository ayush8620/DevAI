import { Hono } from 'hono';
import { isPaidPlanId, type BillingPeriod } from '../../billing/plans.js';
import { normalizeCode, publicCoupon, quoteCoupon } from '../../billing/coupons.js';
import { confirmRedemption, CouponLimitError, getCouponByCode, releaseRedemption, releaseStale, reserveRedemption } from '../../services/coupons.js';
import { logger } from '../../middleware/logger.js';
import type { AppEnv } from '../../types/index.js';

/**
 * Promo codes for the signed-in user (called by the dashboard server during checkout):
 *   POST /user/coupons/validate                 { code, plan, period } -> discount (nothing held)
 *   POST /user/coupons/reserve                  { code, plan, period } -> holds one use
 *   POST /user/coupons/redemptions/:id/release  -> gives the use back (checkout abandoned)
 *   POST /user/coupons/redemptions/:id/confirm  { subscriptionId } -> paid
 */
export const userCouponRoutes = new Hono<AppEnv>();

const bad = (message: string, type = 'invalid_coupon') => ({ error: { type, message } });

async function quote(body: any) {
  const code = normalizeCode(body?.code);
  const plan = body?.plan;
  const period: BillingPeriod = body?.period === 'yearly' ? 'yearly' : 'monthly';
  if (!code || !isPaidPlanId(plan) || (body?.period && body.period !== 'monthly' && body.period !== 'yearly')) {
    return { error: bad('Send a code, a paid plan and a period.', 'validation_error') } as const;
  }
  let coupon = await getCouponByCode(code);
  // Free uses held by abandoned checkouts before deciding that a code is used up.
  if (coupon && coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    await releaseStale(coupon.id);
    coupon = await getCouponByCode(code);
  }
  const q = quoteCoupon(coupon, plan, period);
  if (!q.ok) return { error: bad(q.message, q.reason) } as const;
  return { coupon: coupon!, plan, period, q } as const;
}

userCouponRoutes.post('/validate', async (c) => {
  const r = await quote(await c.req.json().catch(() => ({})));
  if ('error' in r) return c.json(r.error, 400);
  return c.json({ data: { ...publicCoupon(r.coupon), basePaise: r.q.basePaise, discountPaise: r.q.discountPaise, finalPaise: r.q.finalPaise } });
});

userCouponRoutes.post('/reserve', async (c) => {
  const user = c.get('user')!;
  const r = await quote(await c.req.json().catch(() => ({})));
  if ('error' in r) return c.json(r.error, 400);
  try {
    const redemptionId = await reserveRedemption({ couponId: r.coupon.id, userId: user.userId, plan: r.plan, period: r.period, discountPaise: r.q.discountPaise });
    return c.json({ data: { ...publicCoupon(r.coupon), basePaise: r.q.basePaise, discountPaise: r.q.discountPaise, finalPaise: r.q.finalPaise, redemptionId } });
  } catch (err: any) {
    if (err instanceof CouponLimitError) return c.json(bad(err.message, err.reason), 400);
    logger.error({ err: err?.message }, 'Coupon reserve failed');
    return c.json(bad('Could not apply the code right now.', 'server_error'), 500);
  }
});

userCouponRoutes.post('/redemptions/:id/release', async (c) => {
  const user = c.get('user')!;
  await releaseRedemption(c.req.param('id'), user.userId).catch(() => false);
  return c.json({ data: { ok: true } });
});

userCouponRoutes.post('/redemptions/:id/confirm', async (c) => {
  const user = c.get('user')!;
  const { subscriptionId } = await c.req.json().catch(() => ({}));
  if (typeof subscriptionId !== 'string' || !subscriptionId.startsWith('sub_')) return c.json(bad('subscriptionId is required', 'validation_error'), 400);
  const ok = await confirmRedemption(c.req.param('id'), subscriptionId, user.userId).catch((err) => { logger.warn({ err: err?.message }, 'Coupon confirm failed'); return false; });
  return ok ? c.json({ data: { ok: true } }) : c.json(bad('Redemption not found', 'not_found'), 404);
});
