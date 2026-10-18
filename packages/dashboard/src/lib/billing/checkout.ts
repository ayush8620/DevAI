/**
 * Pure planning of a new Razorpay subscription: plan change rules and how a coupon is
 * applied. The route (app/api/billing/subscribe) does the network calls.
 */
import {
  CURRENCY, TOTAL_CYCLES, currentPlanId, monthlyValue, planAmountPaise,
  type BillingPeriod, type BillingRecord, type PaidPlanId,
} from './plans';
import type { CouponQuote } from './coupons-client';
import type { SubscriptionNotes } from './subscription';

const PERIOD_SECONDS: Record<BillingPeriod, number> = { monthly: 30 * 86_400, yearly: 365 * 86_400 };

export interface PlannedSubscription {
  /** Razorpay plan id; null = create a discounted plan for `discountedAmountPaise` first */
  planId: string | null;
  discountedAmountPaise?: number;
  total_count: number;
  start_at?: number;
  offer_id?: string;
  addons?: { item: { name: string; amount: number; currency: string } }[];
  notes: Record<string, string>;
  /** 'new' (no paid plan now), 'now' (upgrade: replaces the current one at once), 'cycle_end' (starts when the current one ends) */
  mode: 'new' | 'now' | 'cycle_end';
  /** What the customer pays in the Checkout window (paise). 500 = Razorpay's refundable ₹5 card check. */
  firstChargePaise: number;
  /** First renewal (paise) */
  recurringPaise: number;
}

export function planSubscription(p: {
  userId: string;
  planId: PaidPlanId;
  period: BillingPeriod;
  razorpayPlanId: string;
  existing?: Partial<BillingRecord> | null;
  coupon?: (CouponQuote & { redemptionId: string }) | null;
  now?: Date;
}): { ok: true; value: PlannedSubscription } | { ok: false; message: string } {
  const now = p.now ?? new Date();
  const base = planAmountPaise(p.planId, p.period);
  const ex = p.existing;
  const curPlan = currentPlanId(ex, now);
  const hasCurrent = curPlan !== 'free' && Boolean(ex?.subscriptionId);

  if (hasCurrent && curPlan === p.planId && (ex!.period ?? 'monthly') === p.period && !ex!.cancelAtPeriodEnd) {
    return { ok: false, message: 'You are already on this plan.' };
  }

  let mode: PlannedSubscription['mode'] = 'new';
  let startAt: number | undefined;
  if (hasCurrent) {
    const up = monthlyValue(p.planId, p.period) > monthlyValue(curPlan, ex!.period ?? 'monthly');
    if (up) mode = 'now';
    else {
      mode = 'cycle_end';
      startAt = Math.floor(new Date(ex!.expiresAt!).getTime() / 1000);
    }
  }
  // A paid plan from the old one-time orders has no subscription to cancel: start after it.
  if (curPlan !== 'free' && !ex?.subscriptionId && ex?.expiresAt) {
    mode = 'cycle_end';
    startAt = Math.floor(new Date(ex.expiresAt).getTime() / 1000);
  }

  const notes: SubscriptionNotes = { userId: p.userId, planId: p.planId, period: p.period };
  if (hasCurrent && mode !== 'new') { notes.replaces = ex!.subscriptionId!; notes.changeMode = mode === 'now' ? 'now' : 'cycle_end'; }

  const out: PlannedSubscription = {
    planId: p.razorpayPlanId,
    total_count: TOTAL_CYCLES[p.period],
    notes: {},
    mode,
    firstChargePaise: startAt ? 500 : base,
    recurringPaise: base,
    ...(startAt ? { start_at: startAt } : {}),
  };

  const c = p.coupon;
  if (c) {
    notes.coupon = c.code;
    notes.couponDuration = c.duration;
    notes.redemptionId = c.redemptionId;
    if (c.finalPaise < 100) return { ok: false, message: 'This code would make the price less than ₹1, which Razorpay cannot charge.' };
    if (c.razorpayOfferId) {
      // Razorpay applies the offer configured in its dashboard (must match the code's terms).
      out.offer_id = c.razorpayOfferId;
      out.firstChargePaise = startAt ? 500 : c.finalPaise;
      out.recurringPaise = c.duration === 'forever' ? c.finalPaise : base;
    } else if (c.duration === 'forever') {
      // Every cycle discounted: subscribe to a plan with the discounted amount.
      out.planId = null;
      out.discountedAmountPaise = c.finalPaise;
      out.firstChargePaise = startAt ? 500 : c.finalPaise;
      out.recurringPaise = c.finalPaise;
    } else {
      // First cycle discounted: pay the discounted first cycle upfront, full price starts one cycle later.
      if (mode === 'cycle_end') return { ok: false, message: 'First-payment codes cannot be used on a plan change that starts at the end of your current period.' };
      out.start_at = Math.floor(now.getTime() / 1000) + PERIOD_SECONDS[p.period];
      out.addons = [{ item: { name: `DevAI ${p.planId} first ${p.period === 'yearly' ? 'year' : 'month'} (code ${c.code})`, amount: c.finalPaise, currency: CURRENCY } }];
      notes.upfrontCycle = '1';
      out.firstChargePaise = c.finalPaise;
      out.recurringPaise = base;
    }
  }
  out.notes = Object.fromEntries(Object.entries(notes).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  return { ok: true, value: out };
}
