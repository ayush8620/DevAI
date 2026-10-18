/**
 * Razorpay server helpers (Plans + Subscriptions API). Keys come only from the environment:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   - API keys (Dashboard → Account & Settings → API keys)
 *   NEXT_PUBLIC_RAZORPAY_KEY_ID            - same key id, exposed to Checkout.js in the browser
 *   RAZORPAY_WEBHOOK_SECRET                - secret set on the webhook in the Razorpay dashboard
 *   RAZORPAY_PLAN_ID_STUDENT / _PRO / _TEAM (+ _YEARLY variants) - plan ids, see
 *                                            scripts/razorpay-create-plans.mjs
 * With the API keys missing, payments are reported as disabled and nothing calls Razorpay.
 */
import { CURRENCY, configuredPlans, type BillingPeriod, type ConfiguredPlans, type PaidPlanId } from './plans';
import type { RazorpaySubscriptionEntity } from './subscription';

const API = 'https://api.razorpay.com/v1';

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
  return { keyId, keySecret };
}

/** Payments work only when the key id, the secret and Clerk (to know who pays) are all set. */
export function paymentsEnabled(): boolean {
  const { keyId, keySecret } = razorpayKeys();
  const clerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return Boolean(keyId && keySecret && clerk);
}

/** Which plan + period combinations can be bought right now (keys AND a plan id set). */
export function purchasablePlans(): ConfiguredPlans {
  if (!paymentsEnabled()) return {};
  return configuredPlans();
}

/** Key id for Checkout.js (public by design). */
export function publicKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || process.env.RAZORPAY_KEY_ID?.trim() || '';
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret } = razorpayKeys();
  if (!keyId || !keySecret) throw new Error('Razorpay is not configured');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as any)?.error?.description || `Razorpay request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export interface CreateSubscriptionInput {
  plan_id: string;
  total_count: number;
  customer_notify?: 0 | 1;
  quantity?: number;
  /** Unix seconds; omitted = starts right after the authorisation payment */
  start_at?: number;
  offer_id?: string;
  /** Upfront amount charged with the authorisation payment */
  addons?: { item: { name: string; amount: number; currency: string } }[];
  notes: Record<string, string>;
}

export function createSubscription(input: CreateSubscriptionInput) {
  return call<RazorpaySubscriptionEntity & { short_url?: string }>('/subscriptions', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchSubscription(id: string) {
  return call<RazorpaySubscriptionEntity>(`/subscriptions/${encodeURIComponent(id)}`);
}

/** Cancel now, or at the end of the current billing cycle (no further charges either way). */
export function cancelSubscription(id: string, atCycleEnd: boolean) {
  return call<RazorpaySubscriptionEntity>(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
}

export function fetchInvoice(id: string) {
  return call<{ id: string; subscription_id?: string | null }>(`/invoices/${encodeURIComponent(id)}`);
}

/**
 * A Razorpay plan with a discounted amount, for "forever" coupons (Razorpay has no API to
 * create offers). Cached per process so repeat redemptions of the same code reuse it.
 */
const discountedPlanCache = new Map<string, string>();
export async function discountedPlanId(p: { planId: PaidPlanId; period: BillingPeriod; amountPaise: number; code: string }): Promise<string> {
  const key = `${p.planId}:${p.period}:${p.amountPaise}`;
  const hit = discountedPlanCache.get(key);
  if (hit) return hit;
  const plan = await call<{ id: string }>('/plans', {
    method: 'POST',
    body: JSON.stringify({
      period: p.period === 'yearly' ? 'yearly' : 'monthly',
      interval: 1,
      item: { name: `DevAI ${p.planId} (${p.period}, code ${p.code})`, amount: p.amountPaise, currency: CURRENCY },
      notes: { devai: 'discounted', planId: p.planId, period: p.period, coupon: p.code },
    }),
  });
  discountedPlanCache.set(key, plan.id);
  return plan.id;
}
