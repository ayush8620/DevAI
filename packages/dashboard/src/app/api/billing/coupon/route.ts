import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPlan, isBillingPeriod, isPaidPlan } from '@/lib/billing/plans';
import { CouponError, validateCoupon } from '@/lib/billing/coupons-client';

export const dynamic = 'force-dynamic';

/** POST { code, planId, period } -> the discount for the signed-in user (nothing is reserved). */
export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: { type: 'authentication_error', message: 'Sign in to use a code.' } }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const plan = getPlan(body?.planId);
  const period = body?.period ?? 'monthly';
  const code = typeof body?.code === 'string' ? body.code.trim().slice(0, 40) : '';
  if (!plan || !isPaidPlan(plan.id) || !isBillingPeriod(period) || !code) {
    return NextResponse.json({ error: { type: 'invalid_request', message: 'Enter a code and choose a paid plan.' } }, { status: 400 });
  }
  const token = await getToken();
  if (!token) return NextResponse.json({ error: { type: 'authentication_error', message: 'Sign in again to use a code.' } }, { status: 401 });
  try {
    const quote = await validateCoupon(token, { code, plan: plan.id, period });
    return NextResponse.json({ data: quote });
  } catch (e: any) {
    const status = e instanceof CouponError ? (e.status >= 500 ? 503 : 400) : 502;
    return NextResponse.json({ error: { type: e?.type || 'invalid_coupon', message: e?.message || 'This code cannot be used.' } }, { status });
  }
}
