"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { CreditCard, CheckCircle2, CalendarClock, Info, AlertTriangle, Loader2, ArrowRightLeft } from 'lucide-react';
import { clerkEnabled, SIGN_IN_URL } from '@/lib/clerk';
import {
  currentPlanId, formatInr, getPlan, planPriceInr, renews,
  type BillingRecord, type ConfiguredPlans, type PlanId,
} from '@/lib/billing/plans';
import { PlanCards } from './plan-cards';

const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'border-green-600/30 bg-green-600/10 text-ok' },
  authenticated: { label: 'Active', cls: 'border-green-600/30 bg-green-600/10 text-ok' },
  pending: { label: 'Payment retrying', cls: 'border-amber-600/30 bg-amber-500/10 text-warn' },
  halted: { label: 'Payment failed', cls: 'border-destructive/30 bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', cls: 'border-border bg-muted text-muted-foreground' },
  completed: { label: 'Ended', cls: 'border-border bg-muted text-muted-foreground' },
};

function Header() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Account</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Billing</h1>
      <p className="text-muted-foreground mt-1">Your DevAI subscription. Payments and renewals are handled by Razorpay.</p>
    </div>
  );
}

function CurrentPlan({ planId, billing, paymentsEnabled, onCancelled }: { planId: PlanId; billing?: Partial<BillingRecord>; paymentsEnabled?: boolean; onCancelled?: () => void }) {
  const plan = getPlan(planId)!;
  const paid = planId !== 'free' && billing?.expiresAt;
  const period = billing?.period ?? 'monthly';
  const willRenew = paid && renews(billing);
  const status = paid ? (billing?.cancelAtPeriodEnd && billing.status === 'active' ? { label: 'Cancels at period end', cls: STATUS_LABEL.cancelled.cls } : STATUS_LABEL[String(billing?.status)]) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const cancel = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error?.message || 'Could not cancel.');
      setConfirming(false);
      onCancelled?.();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div id="cancel" className="scroll-mt-24 rounded-xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</p>
            <p className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
              {plan.name}
              <span className="text-base font-normal text-muted-foreground">· {formatInr(planPriceInr(plan, period))}/{paid && period === 'yearly' ? 'year' : 'month'}</span>
              {status && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>}
            </p>
          </div>
        </div>
        {paid ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            {willRenew ? 'Renews on' : 'Access until'} <span className="font-medium text-foreground">{fmtDate(billing!.expiresAt)}</span>
          </div>
        ) : (
          <Link href="/pricing" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary-hover">See plans</Link>
        )}
      </div>

      {paid && billing?.coupon && <p className="mt-3 text-xs text-muted-foreground">Code <span className="font-semibold text-foreground">{billing.coupon.code}</span> applied {billing.coupon.duration === 'forever' ? 'to every payment' : 'to the first payment'}.</p>}
      {paid && billing?.lastPaymentError && (billing.status === 'pending' || billing.status === 'halted') && (
        <p className="mt-4 flex gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          The last renewal failed ({billing.lastPaymentError}). Razorpay retries automatically; if it keeps failing, the plan ends on {fmtDate(billing.expiresAt)} and you move to Free.
        </p>
      )}
      {paid && billing?.scheduled && (
        <p className="mt-4 flex gap-2 rounded-lg border bg-background/40 p-3 text-sm text-muted-foreground">
          <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Switching to <span className="font-medium text-foreground">{getPlan(billing.scheduled.plan)?.name} ({billing.scheduled.period})</span> on {fmtDate(billing.scheduled.startsAt ?? billing.expiresAt)}.
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border bg-background/40 px-4 py-3"><p className="text-xs text-muted-foreground">Requests / day</p><p className="font-semibold">{plan.limits.requestsPerDay.toLocaleString('en-IN')}</p></div>
        <div className="rounded-lg border bg-background/40 px-4 py-3"><p className="text-xs text-muted-foreground">Projects</p><p className="font-semibold">{plan.limits.projects}</p></div>
        <div className="rounded-lg border bg-background/40 px-4 py-3"><p className="text-xs text-muted-foreground">Provider keys</p><p className="font-semibold">{plan.limits.providerKeys}</p></div>
      </div>

      {paid && willRenew && billing?.subscriptionId && (
        <div className="mt-5 border-t pt-4">
          {!confirming ? (
            <button type="button" disabled={!paymentsEnabled} onClick={() => setConfirming(true)} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60">
              Cancel subscription
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-muted-foreground">Cancel at the end of this period? You keep {plan.name} until {fmtDate(billing.expiresAt)}, then move to Free. No more charges.</p>
              <div className="flex gap-2">
                <button type="button" onClick={cancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10">
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Yes, cancel
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Keep plan</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function PaymentsNote({ enabled }: { enabled: boolean }) {
  if (enabled) return null;
  return (
    <div className="flex gap-3 rounded-xl border border-amber-600/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      <p>Online payments are coming soon. Until Razorpay is connected, every account stays on the Free plan and the upgrade buttons are disabled.</p>
    </div>
  );
}

function WithClerk({ paymentsEnabled, purchasable }: { paymentsEnabled: boolean; purchasable: ConfiguredPlans }) {
  const { user, isLoaded } = useUser();
  const params = useSearchParams();
  const justPaid = params?.get('paid') === '1';
  const [refreshed, setRefreshed] = useState(false);

  // After Checkout the plan is written on the server; reload the user to see it.
  useEffect(() => {
    if (justPaid && user && !refreshed) user.reload().finally(() => setRefreshed(true));
  }, [justPaid, user, refreshed]);

  const billing = (user?.publicMetadata as any)?.billing as Partial<BillingRecord> | undefined;
  const planId = currentPlanId(billing);
  const hasSubscription = planId !== 'free' && Boolean(billing?.subscriptionId) && renews(billing);

  return (
    <>
      {justPaid && (
        <div className="flex items-center gap-3 rounded-xl border border-green-600/30 bg-green-600/5 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-green-600" /> Subscription set up. Your plan renews automatically; cancel anytime below.
        </div>
      )}
      {isLoaded ? <CurrentPlan planId={planId} billing={billing} paymentsEnabled={paymentsEnabled} onCancelled={() => user?.reload()} /> : <div className="h-40 rounded-xl bg-muted animate-pulse" />}
      <PaymentsNote enabled={paymentsEnabled} />
      <div>
        <h2 className="text-lg font-semibold">{hasSubscription ? 'Change plan' : 'Choose a plan'}</h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Plans renew automatically every month or year until you cancel. Upgrades start right away; downgrades and switches to a cheaper billing period start when your current period ends.
        </p>
        <PlanCards purchasable={purchasable} signInUrl={SIGN_IN_URL} currentPlan={isLoaded ? planId : undefined}
          currentPeriod={billing?.period ?? 'monthly'} initialPeriod={billing?.period ?? 'monthly'} hasSubscription={hasSubscription} />
      </div>
    </>
  );
}

export function BillingView({ paymentsEnabled, purchasable }: { paymentsEnabled: boolean; purchasable: ConfiguredPlans }) {
  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-7xl">
      <Header />
      {clerkEnabled ? (
        <WithClerk paymentsEnabled={paymentsEnabled} purchasable={purchasable} />
      ) : (
        <>
          <CurrentPlan planId="free" />
          <div className="flex gap-3 rounded-xl border p-4 text-sm text-muted-foreground bg-card">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Plans are linked to a signed-in account. Sign-in (Clerk) is not configured on this deployment, so billing is unavailable.</p>
          </div>
          <PlanCards purchasable={{}} signInUrl={SIGN_IN_URL} currentPlan="free" />
        </>
      )}
    </div>
  );
}
