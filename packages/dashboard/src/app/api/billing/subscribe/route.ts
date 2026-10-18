import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPlan, isBillingPeriod, isPaidPlan, isStudentEmail, razorpayPlanId, razorpayPlanEnvVar, type BillingPeriod } from '@/lib/billing/plans';
import { createSubscription, discountedPlanId, paymentsEnabled, publicKeyId } from '@/lib/billing/razorpay';
import { readBilling, verifiedEmails } from '@/lib/billing/server';
import { planSubscription } from '@/lib/billing/checkout';
import { CouponError, releaseRedemption, reserveCoupon } from '@/lib/billing/coupons-client';

export const dynamic = 'force-dynamic';

const err = (status: number, type: string, message: string) => NextResponse.json({ error: { type, message } }, { status });

/**
 * POST { planId, period?: 'monthly' | 'yearly', code? } -> a Razorpay subscription for the
 * signed-in user, opened in Checkout.js with its subscription_id. The Razorpay plan id comes
 * from env (RAZORPAY_PLAN_ID_*); amounts never come from the browser.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) return err(503, 'payments_disabled', 'Payments are coming soon.');
  const { userId, getToken } = await auth();
  if (!userId) return err(401, 'authentication_error', 'Sign in to upgrade.');

  let body: any = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const plan = getPlan(body?.planId);
  if (!plan || !isPaidPlan(plan.id)) return err(400, 'invalid_request', 'Choose a paid plan.');
  const period: BillingPeriod = body?.period === undefined ? 'monthly' : body.period;
  if (!isBillingPeriod(period)) return err(400, 'invalid_request', 'period must be monthly or yearly.');
  const rzpPlan = razorpayPlanId(plan.id, period);
  if (!rzpPlan) {
    console.warn(`Razorpay plan id missing: set ${razorpayPlanEnvVar(plan.id, period)}`);
    return err(503, 'payments_disabled', `${plan.name} ${period} billing is coming soon.`);
  }
  const code = typeof body?.code === 'string' ? body.code.trim().slice(0, 40) : '';

  let token: string | null = null;
  let redemptionId: string | null = null;
  try {
    if (plan.studentOnly) {
      const emails = await verifiedEmails(userId);
      if (!emails.some(isStudentEmail)) {
        return err(403, 'student_email_required', 'The Student plan needs a verified college email (.edu or .ac.in). Add one to your account first.');
      }
    }
    const existing = await readBilling(userId);

    let coupon = null;
    if (code) {
      token = await getToken();
      if (!token) return err(401, 'authentication_error', 'Sign in again to use a code.');
      coupon = await reserveCoupon(token, { code, plan: plan.id, period });
      redemptionId = coupon.redemptionId;
    }

    const planned = planSubscription({ userId, planId: plan.id, period, razorpayPlanId: rzpPlan, existing, coupon });
    if (!planned.ok) {
      if (redemptionId && token) await releaseRedemption(token, redemptionId).catch(() => {});
      return err(400, 'invalid_request', planned.message);
    }
    const p = planned.value;
    const planIdToUse = p.planId ?? await discountedPlanId({ planId: plan.id, period, amountPaise: p.discountedAmountPaise!, code: coupon!.code });
    const sub = await createSubscription({
      plan_id: planIdToUse,
      total_count: p.total_count,
      customer_notify: 1,
      ...(p.start_at ? { start_at: p.start_at } : {}),
      ...(p.offer_id ? { offer_id: p.offer_id } : {}),
      ...(p.addons ? { addons: p.addons } : {}),
      notes: p.notes,
    });
    return NextResponse.json({
      subscriptionId: sub.id,
      keyId: publicKeyId(),
      plan: { id: plan.id, name: plan.name },
      period,
      mode: p.mode,
      firstChargePaise: p.firstChargePaise,
      recurringPaise: p.recurringPaise,
      startsAt: p.start_at ? new Date(p.start_at * 1000).toISOString() : null,
      coupon: coupon ? { code: coupon.code, discountPaise: coupon.discountPaise, duration: coupon.duration } : null,
    });
  } catch (e: any) {
    if (redemptionId && token) await releaseRedemption(token, redemptionId).catch(() => {});
    if (e instanceof CouponError) return err(e.status >= 500 ? 503 : 400, e.type, e.message);
    console.error('Razorpay subscription failed:', e?.message);
    return err(502, 'payment_error', 'Could not start the payment. Please try again.');
  }
}
