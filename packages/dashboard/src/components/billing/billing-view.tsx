"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { CreditCard, CheckCircle2, CalendarClock, Info } from 'lucide-react';
import { clerkEnabled, SIGN_IN_URL } from '@/lib/clerk';
import { currentPlanId, formatInr, getPlan, type BillingRecord, type PlanId } from '@/lib/billing/plans';
import { PlanCards } from './plan-cards';

function Header() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Account</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Billing</h1>
      <p className="text-muted-foreground mt-1">Your DevAI plan. Payments are handled by Razorpay.</p>
    </div>
  );
}

function CurrentPlan({ planId, billing }: { planId: PlanId; billing?: Partial<BillingRecord> }) {
  const plan = getPlan(planId)!;
  const active = planId !== 'free' && billing?.expiresAt;
  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</p>
            <p className="text-2xl font-bold tracking-tight">{plan.name} <span className="text-base font-normal text-muted-foreground">· {formatInr(plan.priceInr)}/month</span></p>
          </div>
        </div>
        {active ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            Active until <span className="font-medium text-foreground">{new Date(billing!.expiresAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        ) : (
          <Link href="/pricing" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">See plans</Link>
        )}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border bg-background/40 px-4 py-3"><p className="text-xs text-muted-foreground">Requests / day</p><p className="font-semibold">{plan.limits.requestsPerDay.toLocaleString('en-IN')}</p></div>
        <div className="rounded-lg border bg-background/40 px-4 py-3"><p className="text-xs text-muted-foreground">Projects</p><p className="font-semibold">{plan.limits.projects}</p></div>
        <div className="rounded-lg border bg-background/40 px-4 py-3"><p className="text-xs text-muted-foreground">Provider keys</p><p className="font-semibold">{plan.limits.providerKeys}</p></div>
      </div>
    </div>
  );
}

function PaymentsNote({ enabled }: { enabled: boolean }) {
  if (enabled) return null;
  return (
    <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p>Online payments are coming soon. Until Razorpay is connected, every account stays on the Free plan and the upgrade buttons are disabled.</p>
    </div>
  );
}

function WithClerk({ paymentsEnabled }: { paymentsEnabled: boolean }) {
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

  return (
    <>
      {justPaid && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-green-500" /> Payment received. Your plan is active.
        </div>
      )}
      {isLoaded ? <CurrentPlan planId={planId} billing={billing} /> : <div className="h-40 rounded-xl bg-muted animate-pulse" />}
      <PaymentsNote enabled={paymentsEnabled} />
      <div>
        <h2 className="text-lg font-semibold">Change plan</h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">Each payment covers 30 days. Paying for the same plan again before it ends adds 30 days.</p>
        <PlanCards paymentsEnabled={paymentsEnabled} signInUrl={SIGN_IN_URL} currentPlan={isLoaded ? planId : undefined} />
      </div>
    </>
  );
}

export function BillingView({ paymentsEnabled }: { paymentsEnabled: boolean }) {
  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-7xl">
      <Header />
      {clerkEnabled ? (
        <WithClerk paymentsEnabled={paymentsEnabled} />
      ) : (
        <>
          <CurrentPlan planId="free" />
          <div className="flex gap-3 rounded-xl border p-4 text-sm text-muted-foreground bg-card">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Plans are linked to a signed-in account. Sign-in (Clerk) is not configured on this deployment, so billing is unavailable.</p>
          </div>
          <PlanCards paymentsEnabled={false} signInUrl={SIGN_IN_URL} currentPlan="free" />
        </>
      )}
    </div>
  );
}
