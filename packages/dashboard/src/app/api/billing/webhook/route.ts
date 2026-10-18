import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/billing/signature';
import { fetchOrder, razorpayKeys } from '@/lib/billing/razorpay';
import { activatePlan } from '@/lib/billing/server';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook (Dashboard → Webhooks → https://<dashboard>/api/billing/webhook,
 * events: order.paid, payment.captured). Verified with x-razorpay-signature over the raw body.
 * Backs up the browser callback, e.g. when the user closes the tab right after paying.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: { type: 'payments_disabled', message: 'Webhook is not configured.' } }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'), secret)) {
    return NextResponse.json({ error: { type: 'invalid_signature', message: 'Invalid signature.' } }, { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch {
    return NextResponse.json({ error: { type: 'invalid_request', message: 'Body must be JSON.' } }, { status: 400 });
  }

  if (event?.event !== 'order.paid' && event?.event !== 'payment.captured') {
    return NextResponse.json({ ok: true, ignored: event?.event ?? null });
  }

  const payment = event?.payload?.payment?.entity;
  let order = event?.payload?.order?.entity;
  try {
    if (!order && payment?.order_id && razorpayKeys().keySecret) order = await fetchOrder(payment.order_id);
    const userId = order?.notes?.userId;
    const planId = order?.notes?.planId;
    if (!order || !payment?.id || !userId || !planId) {
      return NextResponse.json({ ok: true, ignored: 'not a DevAI plan order' });
    }
    const result = await activatePlan({
      userId, planId, orderId: order.id, paymentId: payment.id,
      amountPaise: Number(order.amount ?? payment.amount), currency: order.currency ?? payment.currency,
    });
    return NextResponse.json({ ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) });
  } catch (err: any) {
    console.error('Razorpay webhook failed:', err?.message);
    // 500 makes Razorpay retry later
    return NextResponse.json({ error: { type: 'server_error', message: 'Could not process the event.' } }, { status: 500 });
  }
}
