import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 hex digest. */
export function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Razorpay Checkout success: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret).
 */
export function verifyPaymentSignature(
  p: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  if (!keySecret || !p.orderId || !p.paymentId || !p.signature) return false;
  return safeEqualHex(hmacSha256Hex(`${p.orderId}|${p.paymentId}`, keySecret), p.signature);
}

/**
 * Razorpay webhooks: x-razorpay-signature = HMAC_SHA256(raw request body, webhook_secret).
 * Must be computed on the exact raw body, before any JSON parsing.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined, webhookSecret: string): boolean {
  if (!webhookSecret || !signature) return false;
  return safeEqualHex(hmacSha256Hex(rawBody, webhookSecret), signature);
}
