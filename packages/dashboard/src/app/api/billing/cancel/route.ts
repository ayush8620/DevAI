import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cancelSubscription, paymentsEnabled } from '@/lib/billing/razorpay';
import { readBilling, writeBilling } from '@/lib/billing/server';
import type { BillingRecord } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

/**
 * POST -> cancel the signed-in user's subscription at the end of the current billing cycle.
 * The plan stays until then; Razorpay sends subscription.cancelled when the cycle ends,
 * after which the plan reads as Free. A scheduled plan change is cancelled too.
 */
export async function POST() {
  if (!paymentsEnabled()) return NextResponse.json({ error: { type: 'payments_disabled', message: 'Payments are coming soon.' } }, { status: 503 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: { type: 'authentication_error', message: 'Sign in first.' } }, { status: 401 });

  try {
    const billing = await readBilling(userId);
    if (!billing?.subscriptionId) return NextResponse.json({ error: { type: 'invalid_request', message: 'There is no subscription to cancel.' } }, { status: 400 });
    if (billing.cancelAtPeriodEnd) return NextResponse.json({ ok: true, expiresAt: billing.expiresAt, alreadyCancelled: true });
    // Razorpay can only cancel "at cycle end" once a cycle has started; before that, cancel now
    // (an authenticated subscription has not charged a renewal yet).
    const atCycleEnd = billing.status === 'active' || billing.status === 'pending';
    await cancelSubscription(billing.subscriptionId, atCycleEnd);
    if (billing.scheduled?.subscriptionId) await cancelSubscription(billing.scheduled.subscriptionId, false).catch(() => {});
    const next: BillingRecord = { ...(billing as BillingRecord), cancelAtPeriodEnd: true, scheduled: null, updatedAt: new Date().toISOString() };
    await writeBilling(userId, next);
    return NextResponse.json({ ok: true, expiresAt: next.expiresAt });
  } catch (err: any) {
    console.error('Cancel failed:', err?.message);
    return NextResponse.json({ error: { type: 'payment_error', message: 'Could not cancel right now. Please try again.' } }, { status: 502 });
  }
}
