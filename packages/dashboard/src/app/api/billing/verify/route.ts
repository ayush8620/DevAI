import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyPaymentSignature } from '@/lib/billing/signature';
import { fetchOrder, paymentsEnabled, razorpayKeys } from '@/lib/billing/razorpay';
import { activatePlan } from '@/lib/billing/server';

export const dynamic = 'force-dynamic';

/**
 * POST { razorpay_order_id, razorpay_payment_id, razorpay_signature } from Checkout.js.
 * Checks the HMAC signature, then reads the plan and user from the order itself
 * (set by the server when the order was created), never from the request.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: { type: 'payments_disabled', message: 'Payments are coming soon.' } }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: { type: 'authentication_error', message: 'Sign in first.' } }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const orderId = String(body?.razorpay_order_id || '');
  const paymentId = String(body?.razorpay_payment_id || '');
  const signature = String(body?.razorpay_signature || '');

  if (!verifyPaymentSignature({ orderId, paymentId, signature }, razorpayKeys().keySecret)) {
    return NextResponse.json({ error: { type: 'invalid_signature', message: 'Payment could not be verified.' } }, { status: 400 });
  }

  try {
    const order = await fetchOrder(orderId);
    if (order.notes?.userId !== userId) {
      return NextResponse.json({ error: { type: 'permission_error', message: 'This payment belongs to another account.' } }, { status: 403 });
    }
    const result = await activatePlan({
      userId, planId: String(order.notes?.planId || ''), orderId, paymentId, amountPaise: order.amount, currency: order.currency,
    });
    if (!result.ok) {
      return NextResponse.json({ error: { type: 'invalid_request', message: result.reason } }, { status: 400 });
    }
    return NextResponse.json({ ok: true, plan: result.billing.plan, expiresAt: result.billing.expiresAt });
  } catch (err: any) {
    console.error('Payment verification failed:', err?.message);
    return NextResponse.json({ error: { type: 'payment_error', message: 'Payment received but the plan could not be updated yet. It will be applied automatically.' } }, { status: 502 });
  }
}
