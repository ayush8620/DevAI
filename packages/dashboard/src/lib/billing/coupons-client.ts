/**
 * Server-side client for the gateway's coupon API (codes live in the gateway database).
 *  - As the signed-in user (their Clerk session token): validate, reserve, release, confirm.
 *  - From the Razorpay webhook (no user session): confirm with GATEWAY_ADMIN_API_KEY, a
 *    server-only env var on the dashboard. Optional: without it, the browser callback
 *    confirms the redemption, and an unconfirmed reservation is released after 1 hour.
 */
import type { BillingPeriod, PaidPlanId } from './plans';

export function gatewayUrl(): string {
  return (process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
}

export interface CouponQuote {
  code: string;
  kind: 'percent' | 'flat';
  percentOff: number | null;
  amountOffPaise: number | null;
  duration: 'first_cycle' | 'forever';
  razorpayOfferId: string | null;
  basePaise: number;
  discountPaise: number;
  finalPaise: number;
}

export class CouponError extends Error {
  constructor(message: string, public status = 400, public type = 'invalid_coupon') { super(message); }
}

async function gw<T>(path: string, token: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${gatewayUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new CouponError('Codes cannot be checked right now. Try again, or continue without a code.', 503, 'gateway_unreachable');
  }
  const json = await res.json().catch(() => ({})) as any;
  if (!res.ok) throw new CouponError(json?.error?.message || 'This code cannot be used.', res.status, json?.error?.type || 'invalid_coupon');
  return json.data as T;
}

export const validateCoupon = (token: string, p: { code: string; plan: PaidPlanId; period: BillingPeriod }) =>
  gw<CouponQuote>('/user/coupons/validate', token, p);

export const reserveCoupon = (token: string, p: { code: string; plan: PaidPlanId; period: BillingPeriod }) =>
  gw<CouponQuote & { redemptionId: string }>('/user/coupons/reserve', token, p);

export const releaseRedemption = (token: string, redemptionId: string) =>
  gw<{ ok: true }>(`/user/coupons/redemptions/${encodeURIComponent(redemptionId)}/release`, token, {});

export async function confirmRedemption(redemptionId: string, subscriptionId: string, sessionToken: string | null) {
  if (sessionToken) {
    return gw<{ ok: true }>(`/user/coupons/redemptions/${encodeURIComponent(redemptionId)}/confirm`, sessionToken, { subscriptionId });
  }
  const adminKey = process.env.GATEWAY_ADMIN_API_KEY?.trim();
  if (!adminKey) return null;
  return gw<{ ok: true }>(`/admin/coupons/redemptions/${encodeURIComponent(redemptionId)}/confirm`, adminKey, { subscriptionId });
}
