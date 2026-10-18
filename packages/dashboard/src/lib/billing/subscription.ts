/**
 * Razorpay Subscriptions -> the billing record stored on the user (Clerk publicMetadata.billing).
 * Pure functions only (no network), so every state transition is unit-tested in tests/billing.test.ts.
 */
import {
  isBillingPeriod, isPaidPlan, type BillingPeriod, type BillingRecord, type PaidPlanId, type SubscriptionStatus,
} from './plans';

/** The parts of a Razorpay subscription entity we use. Times are Unix seconds. */
export interface RazorpaySubscriptionEntity {
  id: string;
  plan_id?: string;
  status: SubscriptionStatus | string;
  current_start?: number | null;
  current_end?: number | null;
  start_at?: number | null;
  end_at?: number | null;
  ended_at?: number | null;
  charge_at?: number | null;
  notes?: Record<string, string> | unknown[] | null;
}

/** Notes the server puts on every subscription it creates (Razorpay allows 15 string pairs). */
export interface SubscriptionNotes {
  userId: string;
  planId: PaidPlanId;
  period: BillingPeriod;
  /** Subscription this one replaces (plan change) */
  replaces?: string;
  /** 'now': cancel `replaces` right away (upgrade). 'cycle_end': this one starts when `replaces` ends. */
  changeMode?: 'now' | 'cycle_end';
  /** '1' when the first cycle was paid upfront (coupon) and the cycle starts at start_at */
  upfrontCycle?: '1';
  coupon?: string;
  couponDuration?: 'first_cycle' | 'forever';
  redemptionId?: string;
}

export const SUBSCRIPTION_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'payment.failed',
] as const;
export type SubscriptionEventName = typeof SUBSCRIPTION_EVENTS[number];

/** Normalised event: a webhook, or the browser callback after Checkout (source 'verify'). */
export interface BillingEvent {
  name: SubscriptionEventName | 'verify';
  /** x-razorpay-event-id, for idempotency (absent for 'verify') */
  id?: string | null;
  /** Unix seconds (webhook created_at), for ordering */
  createdAt?: number | null;
  subscription: RazorpaySubscriptionEntity;
  paymentId?: string | null;
  paymentError?: string | null;
}

export type Transition =
  | { action: 'write'; billing: BillingRecord; reason: string }
  | { action: 'ignore'; reason: string };

export function readNotes(sub: RazorpaySubscriptionEntity): SubscriptionNotes | null {
  const n = (sub.notes && !Array.isArray(sub.notes) ? sub.notes : {}) as Record<string, string>;
  if (!n.userId || !isPaidPlan(n.planId)) return null;
  const period: BillingPeriod = isBillingPeriod(n.period) ? n.period : 'monthly';
  return {
    userId: n.userId, planId: n.planId, period,
    ...(n.replaces ? { replaces: n.replaces } : {}),
    ...(n.changeMode === 'now' || n.changeMode === 'cycle_end' ? { changeMode: n.changeMode } : {}),
    ...(n.upfrontCycle === '1' ? { upfrontCycle: '1' as const } : {}),
    ...(n.coupon ? { coupon: n.coupon } : {}),
    ...(n.couponDuration === 'first_cycle' || n.couponDuration === 'forever' ? { couponDuration: n.couponDuration } : {}),
    ...(n.redemptionId ? { redemptionId: n.redemptionId } : {}),
  };
}

const iso = (secs: number | null | undefined) => (typeof secs === 'number' && secs > 0 ? new Date(secs * 1000).toISOString() : null);
const later = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
};

/** End of the paid period for a subscription entity. */
export function periodEnd(sub: RazorpaySubscriptionEntity, notes: SubscriptionNotes | null): string | null {
  if (sub.current_end) return iso(sub.current_end);
  // Authenticated with a future start: paid upfront (coupon) -> access until the cycle starts billing.
  if (notes?.upfrontCycle && sub.start_at) return iso(sub.start_at);
  return null;
}

function statusFor(name: BillingEvent['name'], sub: RazorpaySubscriptionEntity): SubscriptionStatus {
  switch (name) {
    case 'subscription.authenticated': return 'authenticated';
    case 'subscription.activated':
    case 'subscription.charged': return 'active';
    case 'subscription.pending': return 'pending';
    case 'subscription.halted': return 'halted';
    case 'subscription.cancelled': return 'cancelled';
    case 'subscription.completed': return 'completed';
    default: return (sub.status as SubscriptionStatus) || 'created';
  }
}

/** Events that make a (new) subscription the user's current one. */
const TAKEOVER = new Set(['subscription.authenticated', 'subscription.activated', 'subscription.charged', 'verify']);

/**
 * Apply one event to the stored record. Rules:
 *  - The same webhook event id is applied once; older events (createdAt) for the same
 *    subscription never overwrite newer state.
 *  - Events of the current subscription update status / period end. A cancel, halt or
 *    completion keeps access until the paid period ends (then the plan reads as Free).
 *  - A different subscription takes over only when it is authenticated/activated/charged
 *    (a plan change). If it starts later (downgrade at period end) while the current one
 *    still has access, it is stored as `scheduled` instead.
 *  - Failure events of another (old or abandoned) subscription are ignored.
 *  - payment.failed only records the error; the plan stays until Razorpay halts it.
 */
export function applyBillingEvent(existing: Partial<BillingRecord> | null | undefined, ev: BillingEvent, now: Date = new Date()): Transition {
  const sub = ev.subscription;
  const notes = readNotes(sub);
  if (!sub?.id) return { action: 'ignore', reason: 'no subscription id' };
  if (!notes) return { action: 'ignore', reason: 'not a DevAI subscription (no userId/planId notes)' };
  if (ev.id && existing?.lastEventId === ev.id) return { action: 'ignore', reason: 'duplicate event' };

  const nowIso = now.toISOString();
  const cur = existing && existing.subscriptionId ? existing : null;
  const same = cur?.subscriptionId === sub.id;
  const isScheduled = existing?.scheduled?.subscriptionId === sub.id;

  if (same && ev.createdAt && cur?.lastEventAt && ev.createdAt < cur.lastEventAt) {
    return { action: 'ignore', reason: 'older than the last applied event' };
  }

  const stamp = { lastEventId: ev.id ?? existing?.lastEventId ?? null, lastEventAt: ev.createdAt ?? existing?.lastEventAt ?? null, updatedAt: nowIso };

  if (ev.name === 'payment.failed') {
    if (!same) return { action: 'ignore', reason: 'payment.failed for another subscription' };
    return { action: 'write', reason: 'payment failed', billing: { ...(cur as BillingRecord), lastPaymentError: ev.paymentError || 'Payment failed', ...stamp } };
  }

  const status = statusFor(ev.name, sub);
  const end = periodEnd(sub, notes);

  if (same) {
    const billing: BillingRecord = {
      ...(cur as BillingRecord),
      plan: notes.planId,
      period: notes.period,
      status,
      // Never move the paid period end backwards (late or reordered events).
      expiresAt: later(cur!.expiresAt, end) ?? cur!.expiresAt ?? nowIso,
      currentStart: iso(sub.current_start) ?? cur!.currentStart ?? null,
      cancelAtPeriodEnd: status === 'cancelled' || status === 'completed' ? true : cur!.cancelAtPeriodEnd ?? false,
      ...(ev.paymentId ? { lastPaymentId: ev.paymentId } : {}),
      ...(status === 'active' && ev.name === 'subscription.charged' ? { lastPaymentError: null } : {}),
      ...stamp,
    };
    return { action: 'write', reason: `${ev.name} -> ${status}`, billing };
  }

  // Another subscription.
  if (!TAKEOVER.has(ev.name)) {
    if (isScheduled && (status === 'cancelled' || status === 'halted' || status === 'completed')) {
      return { action: 'write', reason: 'scheduled change dropped', billing: { ...(existing as BillingRecord), scheduled: null, ...stamp } };
    }
    return { action: 'ignore', reason: `${ev.name} for a subscription that is not the current one` };
  }

  const currentHasAccess = Boolean(cur && cur.expiresAt && new Date(cur.expiresAt) > now
    && ['active', 'authenticated', 'pending', 'halted', 'cancelled', 'completed'].includes(String(cur.status)));
  const startsLater = status === 'authenticated' && !notes.upfrontCycle && Boolean(sub.start_at && sub.start_at * 1000 > now.getTime());

  if (startsLater && currentHasAccess) {
    return {
      action: 'write', reason: 'plan change scheduled for the end of the current period',
      billing: { ...(cur as BillingRecord), scheduled: { subscriptionId: sub.id, plan: notes.planId, period: notes.period, startsAt: iso(sub.start_at) }, ...stamp },
    };
  }
  if (!end && status === 'authenticated') {
    // Mandate set up, nothing paid yet and nothing to keep: wait for activation.
    return { action: 'ignore', reason: 'authenticated, not active yet' };
  }

  const billing: BillingRecord = {
    plan: notes.planId,
    period: notes.period,
    status,
    expiresAt: end ?? nowIso,
    currentStart: iso(sub.current_start),
    subscriptionId: sub.id,
    cancelAtPeriodEnd: false,
    lastPaymentId: ev.paymentId ?? null,
    lastPaymentError: null,
    scheduled: null,
    coupon: notes.coupon ? { code: notes.coupon, duration: notes.couponDuration ?? 'first_cycle' } : null,
    ...stamp,
  };
  return { action: 'write', reason: `${sub.id} is now the current subscription (${status})`, billing };
}

/** Side effects to run after a transition was written (kept pure so they are testable). */
export function followUps(ev: BillingEvent): { cancel?: { subscriptionId: string; atCycleEnd: boolean }; confirmRedemption?: { redemptionId: string; subscriptionId: string } } {
  const notes = readNotes(ev.subscription);
  if (!notes || !TAKEOVER.has(ev.name)) return {};
  const out: ReturnType<typeof followUps> = {};
  if (notes.replaces && notes.replaces !== ev.subscription.id) {
    out.cancel = { subscriptionId: notes.replaces, atCycleEnd: notes.changeMode === 'cycle_end' };
  }
  if (notes.redemptionId) out.confirmRedemption = { redemptionId: notes.redemptionId, subscriptionId: ev.subscription.id };
  return out;
}

/** Normalise a parsed Razorpay webhook body. Returns null for events we do not handle. */
export function parseWebhookEvent(body: any, eventId?: string | null): (Omit<BillingEvent, 'subscription'> & { subscription?: RazorpaySubscriptionEntity; subscriptionIdHint?: string | null; invoiceId?: string | null }) | null {
  const name = body?.event;
  if (!(SUBSCRIPTION_EVENTS as readonly string[]).includes(name)) return null;
  const payment = body?.payload?.payment?.entity;
  const sub = body?.payload?.subscription?.entity as RazorpaySubscriptionEntity | undefined;
  return {
    name,
    id: eventId || null,
    createdAt: typeof body?.created_at === 'number' ? body.created_at : null,
    subscription: sub,
    paymentId: payment?.id ?? null,
    paymentError: name === 'payment.failed' ? (payment?.error_description || payment?.error_reason || 'Payment failed') : null,
    subscriptionIdHint: sub?.id ?? payment?.subscription_id ?? null,
    invoiceId: payment?.invoice_id ?? null,
  };
}
