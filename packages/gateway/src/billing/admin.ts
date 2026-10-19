import { ACCESS_STATUSES, PLAN_PRICES_PAISE, isPaidPlanId, planFromBilling, type BillingPeriod, type PaidPlanId, type PlanId } from './plans.js';

/**
 * Pure helpers behind the admin panel's overview, subscriptions and "change plan" action.
 * Billing records are the Clerk publicMetadata.billing objects the dashboard writes
 * (see packages/dashboard/src/lib/billing/plans.ts BillingRecord).
 */

export type BillingSource = 'razorpay' | 'comp' | 'legacy' | 'none';

interface StoredBilling {
  plan?: unknown; period?: unknown; status?: unknown; expiresAt?: unknown; subscriptionId?: unknown;
  cancelAtPeriodEnd?: unknown; source?: unknown; coupon?: unknown; lastPaymentError?: unknown; updatedAt?: unknown;
  compedBy?: unknown; note?: unknown; currentStart?: unknown;
}

export function billingSource(billing: unknown): BillingSource {
  const b = billing as StoredBilling | null | undefined;
  if (!b || typeof b !== 'object' || !isPaidPlanId(b.plan)) return 'none';
  if (b.source === 'comp') return 'comp';
  return typeof b.subscriptionId === 'string' && b.subscriptionId ? 'razorpay' : 'legacy';
}

const periodOf = (b: StoredBilling): BillingPeriod => (b.period === 'yearly' ? 'yearly' : 'monthly');

/** Renews automatically (and so counts toward MRR): a paid Razorpay subscription that is not cancelled. */
export function isRecurring(billing: unknown, now: Date = new Date()): boolean {
  const b = billing as StoredBilling;
  return billingSource(billing) === 'razorpay'
    && planFromBilling(billing, now) !== 'free'
    && ['active', 'authenticated', 'pending'].includes(String(b.status))
    && b.cancelAtPeriodEnd !== true;
}

/** Monthly value in paise of one subscription (yearly price / 12). */
export function monthlyPaise(plan: PaidPlanId, period: BillingPeriod): number {
  const p = PLAN_PRICES_PAISE[plan][period];
  return period === 'yearly' ? Math.round(p / 12) : p;
}

export interface SubscriptionSummary {
  /** Users whose plan is paid right now (Razorpay, comp or legacy) */
  active: number;
  byPlan: Record<PaidPlanId, number>;
  byPeriod: Record<BillingPeriod, number>;
  bySource: Record<Exclude<BillingSource, 'none'>, number>;
  /** Renewing Razorpay subscriptions only */
  recurring: number;
  /** Monthly recurring revenue estimate, paise (comps and cancelled plans excluded) */
  mrrPaise: number;
}

export function summarizeSubscriptions(users: { billing: unknown }[], now: Date = new Date()): SubscriptionSummary {
  const s: SubscriptionSummary = {
    active: 0, byPlan: { student: 0, pro: 0, team: 0 }, byPeriod: { monthly: 0, yearly: 0 },
    bySource: { razorpay: 0, comp: 0, legacy: 0 }, recurring: 0, mrrPaise: 0,
  };
  for (const u of users) {
    const plan = planFromBilling(u.billing, now);
    if (plan === 'free') continue;
    const b = u.billing as StoredBilling;
    s.active++;
    s.byPlan[plan]++;
    s.byPeriod[periodOf(b)]++;
    const src = billingSource(u.billing);
    if (src !== 'none') s.bySource[src]++;
    if (isRecurring(u.billing, now)) { s.recurring++; s.mrrPaise += monthlyPaise(plan, periodOf(b)); }
  }
  return s;
}

export interface SubscriptionRow {
  plan: PaidPlanId;
  /** Plan the gateway applies right now (free once expired) */
  effectivePlan: PlanId;
  period: BillingPeriod;
  /** Stored Razorpay status, or 'expired' once the paid period is over */
  status: string;
  source: Exclude<BillingSource, 'none'>;
  expiresAt: string | null;
  renews: boolean;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  coupon: string | null;
  lastPaymentError: string | null;
  updatedAt: string | null;
  compedBy: string | null;
}

/** One row of the admin subscriptions list, or null when the user never had a paid plan. */
export function subscriptionRow(billing: unknown, now: Date = new Date()): SubscriptionRow | null {
  const src = billingSource(billing);
  if (src === 'none') return null;
  const b = billing as StoredBilling;
  const effectivePlan = planFromBilling(billing, now);
  const stored = typeof b.status === 'string' ? b.status : 'unknown';
  const expired = effectivePlan === 'free' && ACCESS_STATUSES.includes(stored);
  return {
    plan: b.plan as PaidPlanId,
    effectivePlan,
    period: periodOf(b),
    status: expired ? 'expired' : stored,
    source: src,
    expiresAt: typeof b.expiresAt === 'string' ? b.expiresAt : null,
    renews: isRecurring(billing, now),
    subscriptionId: typeof b.subscriptionId === 'string' ? b.subscriptionId : null,
    cancelAtPeriodEnd: b.cancelAtPeriodEnd === true,
    coupon: b.coupon && typeof (b.coupon as any).code === 'string' ? (b.coupon as any).code : null,
    lastPaymentError: typeof b.lastPaymentError === 'string' ? b.lastPaymentError : null,
    updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : null,
    compedBy: typeof b.compedBy === 'string' ? b.compedBy : null,
  };
}

export interface PlanChange {
  plan: PlanId;
  period: BillingPeriod;
  /** Length of the comp in days (paid plans only) */
  days: number;
  note: string | null;
  /** Overwrite a renewing Razorpay subscription */
  force: boolean;
}

export const MAX_COMP_DAYS = 3660;

export function parsePlanChange(body: any): { ok: true; value: PlanChange } | { ok: false; message: string } {
  const plan = body?.plan;
  if (plan !== 'free' && !isPaidPlanId(plan)) return { ok: false, message: 'plan must be free, student, pro or team' };
  const period = body?.period === undefined || body?.period === null ? 'monthly' : body.period;
  if (period !== 'monthly' && period !== 'yearly') return { ok: false, message: 'period must be monthly or yearly' };
  const days = body?.days === undefined || body?.days === null || body?.days === '' ? (period === 'yearly' ? 365 : 30) : Number(body.days);
  if (!(Number.isInteger(days) && days >= 1 && days <= MAX_COMP_DAYS)) return { ok: false, message: `days must be a whole number from 1 to ${MAX_COMP_DAYS}` };
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  return { ok: true, value: { plan, period, days, note, force: body?.force === true } };
}

/**
 * The billing record for a manual (comp) plan. It has no subscriptionId, so the dashboard
 * shows no Cancel button, a later purchase starts after it ends, and Razorpay webhooks of a
 * new subscription take over normally. cancelAtPeriodEnd = it does not renew.
 */
export function compBilling(c: PlanChange & { plan: PaidPlanId }, actor: string, now: Date = new Date()) {
  return {
    plan: c.plan,
    period: c.period,
    status: 'active',
    expiresAt: new Date(now.getTime() + c.days * 86_400_000).toISOString(),
    currentStart: now.toISOString(),
    cancelAtPeriodEnd: true,
    source: 'comp',
    compedBy: actor,
    note: c.note,
    updatedAt: now.toISOString(),
  };
}

export function errorRate(total: number, errors: number): number {
  return total > 0 ? Math.round((errors / total) * 10_000) / 100 : 0;
}

/** Fill missing days with zeros so charts have one point per day (UTC dates, oldest first). */
export function fillDays<T extends { date: string }>(rows: T[], days: number, zero: Omit<T, 'date'>, now: Date = new Date()): T[] {
  const byDate = new Map(rows.map(r => [r.date, r]));
  const out: T[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push(byDate.get(d) ?? ({ date: d, ...zero } as T));
  }
  return out;
}

export function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
