/**
 * Promo code rules (pure, unit-tested). Storage and the atomic redemption statements are in
 * services/coupons.ts.
 */
import { PLAN_PRICES_PAISE, isPaidPlanId, type BillingPeriod, type PaidPlanId } from './plans.js';

export type CouponKind = 'percent' | 'flat';
export type CouponDuration = 'first_cycle' | 'forever';

export interface CouponInput {
  code: string;
  kind: CouponKind;
  percentOff: number | null;
  amountOffPaise: number | null;
  plans: PaidPlanId[];
  periods: BillingPeriod[];
  duration: CouponDuration;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  oncePerUser: boolean;
  razorpayOfferId: string | null;
  note: string | null;
}

export interface CouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  percentOff: number | null;
  amountOffPaise: number | null;
  plans: string[];
  periods: string[];
  duration: CouponDuration;
  expiresAt: Date | string | null;
  maxRedemptions: number | null;
  oncePerUser: boolean;
  razorpayOfferId: string | null;
  redemptionCount: number;
  status: 'active' | 'disabled';
}

/** Razorpay cannot charge less than ₹1. */
export const MIN_CHARGE_PAISE = 100;
export const MAX_PERCENT_OFF = 90;
/** How long a code is held for a checkout that has not been paid yet. */
export const RESERVATION_MINUTES = 60;

export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

const PERIODS: BillingPeriod[] = ['monthly', 'yearly'];
const optInt = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

/** Validate an admin's create-coupon body. Flat amounts are given in rupees (amountOffInr) or paise. */
export function parseCouponInput(body: any, now: Date = new Date()): { ok: true; value: CouponInput } | { ok: false; message: string } {
  const code = normalizeCode(body?.code);
  if (!CODE_RE.test(code)) return { ok: false, message: 'code must be 3-32 characters: letters, digits, _ or -' };
  const kind = body?.kind;
  if (kind !== 'percent' && kind !== 'flat') return { ok: false, message: 'kind must be percent or flat' };
  let percentOff: number | null = null;
  let amountOffPaise: number | null = null;
  if (kind === 'percent') {
    percentOff = optInt(body?.percentOff);
    if (!(Number.isInteger(percentOff) && percentOff! >= 1 && percentOff! <= MAX_PERCENT_OFF)) return { ok: false, message: `percentOff must be a whole number from 1 to ${MAX_PERCENT_OFF}` };
  } else {
    const inr = optInt(body?.amountOffInr);
    amountOffPaise = inr !== null ? Math.round(inr * 100) : optInt(body?.amountOffPaise);
    if (!(Number.isInteger(amountOffPaise) && amountOffPaise! >= 100)) return { ok: false, message: 'amountOffInr must be at least ₹1' };
  }
  const plans = Array.isArray(body?.plans) ? [...new Set(body.plans.map(String))] : [];
  if (!plans.every(isPaidPlanId)) return { ok: false, message: 'plans may only contain student, pro and team' };
  const periods = Array.isArray(body?.periods) ? [...new Set(body.periods.map(String))] : [];
  if (!periods.every(p => (PERIODS as string[]).includes(p as string))) return { ok: false, message: 'periods may only contain monthly and yearly' };
  const duration = body?.duration ?? 'first_cycle';
  if (duration !== 'first_cycle' && duration !== 'forever') return { ok: false, message: 'duration must be first_cycle or forever' };
  let expiresAt: Date | null = null;
  if (body?.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) return { ok: false, message: 'expiresAt must be a date (ISO 8601)' };
    if (expiresAt <= now) return { ok: false, message: 'expiresAt must be in the future' };
  }
  const maxRedemptions = optInt(body?.maxRedemptions);
  if (maxRedemptions !== null && !(Number.isInteger(maxRedemptions) && maxRedemptions >= 1)) return { ok: false, message: 'maxRedemptions must be a positive whole number' };
  const oncePerUser = body?.oncePerUser === undefined ? true : Boolean(body.oncePerUser);
  const offer = typeof body?.razorpayOfferId === 'string' ? body.razorpayOfferId.trim() : '';
  if (offer && !/^offer_[A-Za-z0-9]{6,40}$/.test(offer)) return { ok: false, message: 'razorpayOfferId must look like offer_XXXXXXXX' };
  // A flat code must leave at least ₹1 on every plan it applies to.
  if (kind === 'flat') {
    const targets = (plans.length ? plans : Object.keys(PLAN_PRICES_PAISE)) as PaidPlanId[];
    const ps = (periods.length ? periods : PERIODS) as BillingPeriod[];
    const cheapest = Math.min(...targets.flatMap(p => ps.map(pe => PLAN_PRICES_PAISE[p][pe])));
    if (cheapest - amountOffPaise! < MIN_CHARGE_PAISE) return { ok: false, message: `The discount must leave at least ₹1 on the cheapest plan it applies to (₹${cheapest / 100}). Limit it to more expensive plans or lower the amount.` };
  }
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  return {
    ok: true,
    value: {
      code, kind, percentOff, amountOffPaise,
      plans: plans as PaidPlanId[], periods: periods as BillingPeriod[], duration,
      expiresAt, maxRedemptions, oncePerUser, razorpayOfferId: offer || null, note,
    },
  };
}

export type CouponCheck =
  | { ok: true; basePaise: number; discountPaise: number; finalPaise: number }
  | { ok: false; reason: 'not_found' | 'disabled' | 'expired' | 'used_up' | 'wrong_plan' | 'wrong_period' | 'too_low'; message: string };

/** Discount for one plan + period. Usage limits are checked atomically by the database. */
export function quoteCoupon(c: CouponRow | null | undefined, plan: PaidPlanId, period: BillingPeriod, now: Date = new Date()): CouponCheck {
  if (!c) return { ok: false, reason: 'not_found', message: 'This code does not exist.' };
  if (c.status !== 'active') return { ok: false, reason: 'disabled', message: 'This code is no longer active.' };
  if (c.expiresAt && new Date(c.expiresAt) <= now) return { ok: false, reason: 'expired', message: 'This code has expired.' };
  if (c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions) return { ok: false, reason: 'used_up', message: 'This code has been fully redeemed.' };
  if (c.plans.length && !c.plans.includes(plan)) return { ok: false, reason: 'wrong_plan', message: `This code is not valid for the ${plan} plan.` };
  if (c.periods.length && !c.periods.includes(period)) return { ok: false, reason: 'wrong_period', message: `This code is not valid for ${period} billing.` };
  const basePaise = PLAN_PRICES_PAISE[plan][period];
  const raw = c.kind === 'percent' ? Math.round(basePaise * (c.percentOff ?? 0) / 100) : (c.amountOffPaise ?? 0);
  const discountPaise = Math.min(raw, basePaise);
  const finalPaise = basePaise - discountPaise;
  if (finalPaise < MIN_CHARGE_PAISE) return { ok: false, reason: 'too_low', message: 'This code cannot be used on this plan.' };
  return { ok: true, basePaise, discountPaise, finalPaise };
}

/** Public view of a code for the checkout. */
export function publicCoupon(c: CouponRow) {
  return {
    code: c.code, kind: c.kind, percentOff: c.percentOff, amountOffPaise: c.amountOffPaise,
    duration: c.duration, razorpayOfferId: c.razorpayOfferId,
  };
}
