"use client";
import { useState } from 'react';
import { Loader2, Tag, X } from 'lucide-react';
import { formatInr, type BillingPeriod, type PaidPlanId } from '@/lib/billing/plans';

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void } }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
/** Brand orange (logo accent), used for the Razorpay Checkout window. */
const CHECKOUT_COLOR = '#F97316';

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
  period: BillingPeriod;
  /** Server decides: Razorpay + Clerk keys and this plan's Razorpay plan id are set */
  enabled: boolean;
  signInUrl: string;
  /** Where to send the user after a successful payment */
  successUrl?: string;
  current?: boolean;
  highlight?: boolean;
  label?: string;
  /** Note shown under the button, e.g. "Starts when your current plan ends" */
  hint?: string;
  onPaid?: () => void;
}

interface Quote { code: string; discountPaise: number; finalPaise: number; duration: 'first_cycle' | 'forever' }

const rupees = (paise: number) => formatInr(Math.round(paise) / 100);

/**
 * Subscribe button: the server creates a Razorpay subscription, Checkout.js collects the
 * mandate (UPI Autopay / card / eMandate) with subscription_id, then the server verifies
 * the payment signature. Optional promo code, validated on the server.
 */
export function CheckoutButton({ planId, planName, period, enabled, signInUrl, successUrl = '/dashboard/billing?paid=1', current, highlight, label, hint, onPaid }: CheckoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [checking, setChecking] = useState(false);

  const base = `mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${highlight ? 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg shadow-primary/20' : 'border hover:bg-muted'}`;

  if (current) return <button disabled className={base}>Current plan</button>;
  if (!enabled) return <button disabled className={base} title="Online payments are not enabled yet">Payments coming soon</button>;

  const goSignIn = () => {
    const back = typeof window !== 'undefined' ? window.location.pathname : '/pricing';
    window.location.href = `${signInUrl}?redirect_url=${encodeURIComponent(back)}`;
  };

  const apply = async () => {
    if (!code.trim()) return;
    setChecking(true); setError(null); setQuote(null);
    try {
      const res = await fetch('/api/billing/coupon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), planId, period }) });
      if (res.status === 401) return goSignIn();
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error?.message || 'This code cannot be used.');
      setQuote(out.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, period, ...(quote ? { code: quote.code } : {}) }),
      });
      if (res.status === 401) return goSignIn();
      const sub = await res.json();
      if (!res.ok) throw new Error(sub?.error?.message || 'Could not start the payment.');
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error('Could not load Razorpay Checkout. Check your connection.');

      const rzp = new window.Razorpay({
        key: sub.keyId,
        subscription_id: sub.subscriptionId,
        name: 'DevAI',
        description: `${planName} plan · billed ${period === 'yearly' ? 'yearly' : 'monthly'}${sub.coupon ? ` · code ${sub.coupon.code}` : ''}`,
        theme: { color: CHECKOUT_COLOR },
        handler: async (r: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
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

  const unit = period === 'yearly' ? '/year' : '/month';
  return (
    <div>
      <button onClick={start} disabled={busy} className={base}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {label ?? `Upgrade to ${planName}`}
      </button>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {quote ? (
        <p className="mt-2 flex items-center justify-between gap-2 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs">
          <span><span className="font-semibold text-primary">{quote.code}</span>: {rupees(quote.finalPaise)}{unit} {quote.duration === 'first_cycle' ? `for the first ${period === 'yearly' ? 'year' : 'month'}` : 'while subscribed'} (save {rupees(quote.discountPaise)})</span>
          <button type="button" aria-label="Remove code" onClick={() => { setQuote(null); setCode(''); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </p>
      ) : codeOpen ? (
        <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); apply(); }}>
          <label className="sr-only" htmlFor={`code-${planId}`}>Promo code</label>
          <input id={`code-${planId}`} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={32} autoComplete="off"
            className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" disabled={checking || !code.trim()} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60">
            {checking && <Loader2 className="h-3 w-3 animate-spin" />}Apply
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setCodeOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Tag className="h-3 w-3" /> Have a code?
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
