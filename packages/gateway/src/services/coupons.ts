/**
 * Coupon storage and redemption. Every limit is enforced inside ONE SQL statement, so two
 * checkouts racing for the last use of a code cannot both win:
 *   - the UPDATE on coupons increments redemption_count only while it is below
 *     max_redemptions (PostgreSQL re-checks the WHERE after taking the row lock), and
 *   - the partial unique index coupon_redemptions_once_idx allows one live redemption per
 *     user on once-per-user codes; a violation rolls the increment back with the statement.
 * Works on Neon's HTTP driver (no interactive transactions needed).
 *
 * Lifecycle: reserved (checkout opened, held RESERVATION_MINUTES) -> confirmed (subscription
 * paid) or released (checkout abandoned / failed). Expired reservations are released lazily.
 */
import { sql, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { coupons } from '../db/schema/index.js';
import { RESERVATION_MINUTES, type CouponInput, type CouponRow } from '../billing/coupons.js';
import type { BillingPeriod, PaidPlanId } from '../billing/plans.js';

const NOW = sql`(now() AT TIME ZONE 'UTC')`;

function rows<T = any>(r: unknown): T[] {
  const x = r as any;
  return (Array.isArray(x) ? x : x?.rows ?? []) as T[];
}

export class CouponLimitError extends Error {
  constructor(public reason: 'used_up' | 'already_used' | 'unavailable', message: string) { super(message); }
}

export async function getCouponByCode(code: string): Promise<CouponRow | null> {
  const [row] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return (row as unknown as CouponRow) ?? null;
}

export async function listCoupons() {
  const list = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  const counts = rows<{ coupon_id: string; confirmed: string; reserved: string }>(await db.execute(sql`
    SELECT coupon_id,
      count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
      count(*) FILTER (WHERE status = 'reserved' AND reserved_until > ${NOW}) AS reserved
    FROM coupon_redemptions GROUP BY coupon_id`));
  const by = new Map(counts.map(c => [c.coupon_id, c]));
  return list.map(c => ({ ...c, confirmedCount: Number(by.get(c.id)?.confirmed ?? 0), reservedCount: Number(by.get(c.id)?.reserved ?? 0) }));
}

export async function createCoupon(v: CouponInput, actor: string) {
  const [row] = await db.insert(coupons).values({
    code: v.code, kind: v.kind, percentOff: v.percentOff, amountOffPaise: v.amountOffPaise,
    plans: v.plans, periods: v.periods, duration: v.duration, expiresAt: v.expiresAt,
    maxRedemptions: v.maxRedemptions, oncePerUser: v.oncePerUser, razorpayOfferId: v.razorpayOfferId,
    note: v.note, createdBy: actor, status: 'active',
  }).returning();
  return row;
}

export async function updateCoupon(id: string, patch: { status?: 'active' | 'disabled'; expiresAt?: Date | null; maxRedemptions?: number | null }) {
  const [row] = await db.update(coupons).set({ ...patch, updatedAt: new Date() }).where(eq(coupons.id, id)).returning();
  return row ?? null;
}

/** Release reservations past their hold time (and, optionally, this user's own earlier hold on the code). */
export async function releaseStale(couponId: string, userId?: string) {
  await db.execute(sql`
    WITH rel AS (
      UPDATE coupon_redemptions SET status = 'released'
      WHERE coupon_id = ${couponId} AND status = 'reserved'
        AND (reserved_until < ${NOW} ${userId ? sql`OR user_id = ${userId}` : sql``})
      RETURNING coupon_id)
    UPDATE coupons SET redemption_count = GREATEST(redemption_count - (SELECT count(*) FROM rel), 0), updated_at = ${NOW}
    WHERE id = ${couponId} AND EXISTS (SELECT 1 FROM rel)`);
}

/** Atomically take one use of a code for a user. Throws CouponLimitError when a limit is hit. */
export async function reserveRedemption(p: { couponId: string; userId: string; plan: PaidPlanId; period: BillingPeriod; discountPaise: number }): Promise<string> {
  await releaseStale(p.couponId, p.userId);
  let out: { id: string }[];
  try {
    out = rows<{ id: string }>(await db.execute(sql`
      WITH c AS (
        UPDATE coupons SET redemption_count = redemption_count + 1, updated_at = ${NOW}
        WHERE id = ${p.couponId} AND status = 'active'
          AND (expires_at IS NULL OR expires_at > ${NOW})
          AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
        RETURNING id, once_per_user)
      INSERT INTO coupon_redemptions (coupon_id, user_id, user_once_key, plan, period, discount_paise, status, reserved_until)
      SELECT id, ${p.userId}, CASE WHEN once_per_user THEN ${p.userId} ELSE NULL END, ${p.plan}, ${p.period}, ${p.discountPaise},
             'reserved', ${NOW} + make_interval(mins => ${RESERVATION_MINUTES})
      FROM c
      RETURNING id`));
  } catch (err: any) {
    const code = err?.code ?? err?.cause?.code;
    if (code === '23505') throw new CouponLimitError('already_used', 'You have already used this code.');
    throw err;
  }
  if (!out.length) throw new CouponLimitError('used_up', 'This code has been fully redeemed or is no longer active.');
  return out[0].id;
}

export async function releaseRedemption(id: string, userId: string): Promise<boolean> {
  const r = rows(await db.execute(sql`
    WITH r AS (
      UPDATE coupon_redemptions SET status = 'released'
      WHERE id = ${id} AND user_id = ${userId} AND status = 'reserved'
      RETURNING coupon_id)
    UPDATE coupons SET redemption_count = GREATEST(redemption_count - 1, 0), updated_at = ${NOW}
    WHERE id IN (SELECT coupon_id FROM r) RETURNING id`));
  return r.length > 0;
}

/**
 * Mark a redemption as paid. Idempotent. A reservation that was already released (hold
 * expired before the webhook arrived) is counted again, since the customer did pay with it.
 */
export async function confirmRedemption(id: string, subscriptionId: string, userId: string | null): Promise<boolean> {
  const r = rows<{ old_status: string }>(await db.execute(sql`
    WITH prev AS (
      SELECT id, status AS old_status, coupon_id FROM coupon_redemptions
      WHERE id = ${id} ${userId ? sql`AND user_id = ${userId}` : sql``} FOR UPDATE),
    upd AS (
      UPDATE coupon_redemptions r SET status = 'confirmed', subscription_id = ${subscriptionId}, confirmed_at = ${NOW}, reserved_until = NULL
      FROM prev WHERE r.id = prev.id AND prev.old_status IN ('reserved', 'released')
      RETURNING prev.old_status, prev.coupon_id),
    bump AS (
      UPDATE coupons SET redemption_count = redemption_count + 1, updated_at = ${NOW}
      WHERE id IN (SELECT coupon_id FROM upd WHERE old_status = 'released') RETURNING id)
    SELECT old_status FROM prev`));
  return r.length > 0;
}
