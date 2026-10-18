"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Check, GraduationCap } from 'lucide-react';
import {
  PLANS, formatInr, getPlan, isPaidPlan, monthlyValue, planPriceInr, yearlyMonthlyEquivalent, yearlySavingsPercent,
  type BillingPeriod, type ConfiguredPlans, type PlanId,
} from '@/lib/billing/plans';
import { CheckoutButton } from './checkout-button';

/** Monthly / Yearly switch with the "2 months free" badge. */
export function PeriodToggle({ period, onChange }: { period: BillingPeriod; onChange: (p: BillingPeriod) => void }) {
  const save = yearlySavingsPercent(getPlan('pro')!);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border bg-card p-1 text-sm">
        {(['monthly', 'yearly'] as const).map(p => (
          <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => onChange(p)}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors ${period === p ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
            {p === 'monthly' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>
      <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
        Yearly: 2 months free · save {save}%
      </span>
    </div>
  );
}

/** Plan grid shared by the landing page, /pricing and the Billing page. */
export function PlanCards({ purchasable, signInUrl, currentPlan, currentPeriod, compact, initialPeriod = 'monthly', hasSubscription }: {
  /** Which plan + period can be bought (from the server; empty = payments coming soon) */
  purchasable: ConfiguredPlans;
  signInUrl: string;
  currentPlan?: PlanId;
  currentPeriod?: BillingPeriod;
  compact?: boolean;
  initialPeriod?: BillingPeriod;
  /** The user has a paid subscription (changes the button labels) */
  hasSubscription?: boolean;
}) {
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const currentValue = currentPlan ? monthlyValue(currentPlan, currentPeriod ?? 'monthly') : 0;
  return (
    <div>
      <div className="mb-8"><PeriodToggle period={period} onChange={setPeriod} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map(p => {
          const price = planPriceInr(p, period);
          const paid = isPaidPlan(p.id);
          // A cancelled (non-renewing) paid plan can be resumed, so it is only "current" while it renews.
          const isCurrent = currentPlan === p.id && (!paid || ((currentPeriod ?? 'monthly') === period && hasSubscription !== false));
          const resume = paid && currentPlan === p.id && !isCurrent && hasSubscription === false;
          const value = monthlyValue(p.id, period);
          const changeLabel = hasSubscription && paid && !isCurrent
            ? (value > currentValue ? `Upgrade to ${p.name}` : `Switch to ${p.name}`)
            : undefined;
          const hint = resume ? 'Starts when your current period ends.'
            : hasSubscription && paid && !isCurrent
              ? (value > currentValue ? 'Starts now; your current plan ends today (no proration).' : 'Starts when your current period ends.')
              : undefined;
          return (
            <div key={p.id} className={`relative flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary/50 ${p.highlight ? 'ring-2 ring-primary border-primary' : ''}`}>
              {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">Popular</span>}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.studentOnly && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"><GraduationCap className="h-3 w-3" /> College email</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{formatInr(price)}</span>
                <span className="text-sm text-muted-foreground">{paid ? (period === 'yearly' ? '/year' : '/month') : 'forever'}</span>
              </p>
              <p className="mt-1 min-h-[1rem] text-xs text-muted-foreground">
                {!paid ? 'No card needed' : period === 'yearly'
                  ? <>≈ {formatInr(yearlyMonthlyEquivalent(p))}/month, billed yearly · <span className="text-primary font-medium">2 months free</span></>
                  : 'Billed monthly, cancel anytime'}
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-medium text-foreground">{p.limits.requestsPerDay.toLocaleString('en-IN')}</span> <span className="text-muted-foreground">requests / day</span></span></li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-medium text-foreground">{p.limits.projects}</span> <span className="text-muted-foreground">{p.limits.projects === 1 ? 'project' : 'projects'}</span></span></li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="font-medium text-foreground">{p.limits.providerKeys}</span> <span className="text-muted-foreground">provider API keys</span></span></li>
              </ul>
              {!compact && (
                <ul className="mt-4 space-y-2 border-t pt-4 text-sm flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />{f}</li>
                  ))}
                  <li className="flex items-start gap-2 text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />{p.support}</li>
                </ul>
              )}
              {compact && <div className="flex-1" />}
              {isPaidPlan(p.id) ? (
                <CheckoutButton
                  key={`${p.id}-${period}`}
                  planId={p.id}
                  planName={p.name}
                  period={period}
                  enabled={Boolean(purchasable[`${p.id}_${period}`])}
                  signInUrl={signInUrl}
                  highlight={p.highlight}
                  current={isCurrent}
                  label={resume ? `Resubscribe to ${p.name}` : changeLabel}
                  hint={hint}
                />
              ) : currentPlan === 'free' ? (
                <button disabled className="mt-8 inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium opacity-60">Current plan</button>
              ) : (
                <Link href={hasSubscription ? '/dashboard/billing#cancel' : '/dashboard'} className="mt-8 inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                  {hasSubscription ? 'Cancel to go back to Free' : 'Get started'}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
