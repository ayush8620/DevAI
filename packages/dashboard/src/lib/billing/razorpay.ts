/**
 * Razorpay server helpers. Keys come only from the environment:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   - API keys (Dashboard → Account & Settings → API keys)
 *   NEXT_PUBLIC_RAZORPAY_KEY_ID            - same key id, exposed to Checkout.js in the browser
 *   RAZORPAY_WEBHOOK_SECRET                - secret set on the webhook in the Razorpay dashboard
 * With the API keys missing, payments are reported as disabled and nothing calls Razorpay.
 */

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

/** Key id for Checkout.js (public by design). */
export function publicKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || process.env.RAZORPAY_KEY_ID?.trim() || '';
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  notes?: Record<string, string>;
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

export function createOrder(o: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>('/orders', { method: 'POST', body: JSON.stringify(o) });
}

export function fetchOrder(orderId: string) {
  return call<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}
