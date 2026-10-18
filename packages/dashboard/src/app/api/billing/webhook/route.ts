import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/billing/signature';
import { fetchInvoice, fetchSubscription, razorpayKeys } from '@/lib/billing/razorpay';
import { applyAndPersist } from '@/lib/billing/server';
import { parseWebhookEvent, readNotes, type RazorpaySubscriptionEntity } from '@/lib/billing/subscription';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook: Dashboard → Account & Settings → Webhooks → https://<dashboard>/api/billing/webhook
 * with the secret in RAZORPAY_WEBHOOK_SECRET and these events:
 *   subscription.authenticated, subscription.activated, subscription.charged, subscription.pending,
 *   subscription.halted, subscription.cancelled, subscription.completed, payment.failed
 * Verified with x-razorpay-signature over the raw body; x-razorpay-event-id makes it idempotent.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: { type: 'payments_disabled', message: 'Webhook is not configured.' } }, { status: 503 });
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'), secret)) {
    return NextResponse.json({ error: { type: 'invalid_signature', message: 'Invalid signature.' } }, { status: 400 });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: { type: 'invalid_request', message: 'Body must be JSON.' } }, { status: 400 });
  }
  const ev = parseWebhookEvent(body, req.headers.get('x-razorpay-event-id'));
  if (!ev) return NextResponse.json({ ok: true, ignored: body?.event ?? null });

  try {
    let sub: RazorpaySubscriptionEntity | undefined = ev.subscription;
    // payment.failed carries only the payment: find its subscription (via the invoice).
    if (!sub && razorpayKeys().keySecret) {
      let subId = ev.subscriptionIdHint;
      if (!subId && ev.invoiceId) subId = (await fetchInvoice(ev.invoiceId)).subscription_id ?? null;
      if (subId) sub = await fetchSubscription(subId);
    }
    const userId = sub ? readNotes(sub)?.userId : undefined;
    if (!sub || !userId) return NextResponse.json({ ok: true, ignored: 'not a DevAI subscription' });
    const t = await applyAndPersist(userId, { ...ev, subscription: sub });
    return NextResponse.json({ ok: true, action: t.action, reason: t.reason });
  } catch (err: any) {
    console.error('Razorpay webhook failed:', err?.message);
    // 500 makes Razorpay retry later
    return NextResponse.json({ error: { type: 'server_error', message: 'Could not process the event.' } }, { status: 500 });
  }
}
