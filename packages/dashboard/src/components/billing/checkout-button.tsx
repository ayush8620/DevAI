"use client";
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PaidPlanId } from '@/lib/billing/plans';

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void } }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise(resolve => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const s = existing ?? document.createElement('script');
    s.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
    s.addEventListener('error', () => resolve(false));
    if (!existing) { s.src = SCRIPT; s.async = true; document.body.appendChild(s); }
  });
}

export interface CheckoutButtonProps {
  planId: PaidPlanId;
  planName: string;
  /** Server decides: Razorpay + Clerk keys present */
  enabled: boolean;
  signInUrl: string;
  /** Where to send the user after a successful payment */
  successUrl?: string;
  current?: boolean;
  highlight?: boolean;
  label?: string;
  onPaid?: () => void;
}

/** Upgrade button: creates an order on the server, opens Razorpay Checkout, then verifies the payment. */
export function CheckoutButton({ planId, planName, enabled, signInUrl, successUrl = '/dashboard/billing?paid=1', current, highlight, label, onPaid }: CheckoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${highlight ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20' : 'border hover:bg-muted'}`;

  if (current) return <button disabled className={base}>Current plan</button>;
  if (!enabled) return <button disabled className={base} title="Online payments are not enabled yet">Payments coming soon</button>;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId }),
      });
      if (res.status === 401) {
        const back = typeof window !== 'undefined' ? window.location.pathname : '/pricing';
        window.location.href = `${signInUrl}?redirect_url=${encodeURIComponent(back)}`;
        return;
      }
      const order = await res.json();
      if (!res.ok) throw new Error(order?.error?.message || 'Could not start the payment.');
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error('Could not load Razorpay Checkout. Check your connection.');

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'DevAI',
        description: `${planName} plan · 30 days`,
        theme: { color: '#3b82f6' },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const v = await fetch('/api/billing/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r),
            });
            const out = await v.json().catch(() => ({}));
            if (!v.ok) throw new Error(out?.error?.message || 'Payment could not be verified.');
            if (onPaid) onPaid(); else window.location.href = successUrl;
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on('payment.failed', (r: any) => { setError(r?.error?.description || 'Payment failed.'); setBusy(false); });
      rzp.open();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div>
      <button onClick={start} disabled={busy} className={base}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {label ?? `Upgrade to ${planName}`}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
