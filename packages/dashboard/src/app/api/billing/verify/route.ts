import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifySubscriptionSignature } from '@/lib/billing/signature';
import { fetchSubscription, paymentsEnabled, razorpayKeys } from '@/lib/billing/razorpay';
import { applyAndPersist } from '@/lib/billing/server';
import { readNotes } from '@/lib/billing/subscription';

export const dynamic = 'force-dynamic';

/**
 * POST { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } from Checkout.js.
 * Checks HMAC_SHA256(payment_id|subscription_id, key_secret), then reads the user and plan
 * from the subscription's notes (set by the server), never from the request.
 * The webhook does the same independently, so closing the tab right after paying is fine.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) return NextResponse.json({ error: { type: 'payments_disabled', message: 'Payments are coming soon.' } }, { status: 503 });
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: { type: 'authentication_error', message: 'Sign in first.' } }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const paymentId = String(body?.razorpay_payment_id || '');
  const subscriptionId = String(body?.razorpay_subscription_id || '');
  const signature = String(body?.razorpay_signature || '');

  if (!verifySubscriptionSignature({ paymentId, subscriptionId, signature }, razorpayKeys().keySecret)) {
    return NextResponse.json({ error: { type: 'invalid_signature', message: 'Payment could not be verified.' } }, { status: 400 });
  }

  try {
    const sub = await fetchSubscription(subscriptionId);
    if (readNotes(sub)?.userId !== userId) {
      return NextResponse.json({ error: { type: 'permission_error', message: 'This subscription belongs to another account.' } }, { status: 403 });
    }
    const t = await applyAndPersist(userId, { name: 'verify', subscription: sub, paymentId }, { sessionToken: await getToken() });
    const billing = t.action === 'write' ? t.billing : null;
    return NextResponse.json({ ok: true, status: sub.status, plan: billing?.plan ?? null, expiresAt: billing?.expiresAt ?? null, scheduled: billing?.scheduled ?? null });
  } catch (err: any) {
    console.error('Subscription verification failed:', err?.message);
    return NextResponse.json({ error: { type: 'payment_error', message: 'Payment received but the plan could not be updated yet. It will be applied automatically.' } }, { status: 502 });
  }
}
