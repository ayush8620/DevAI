import Link from 'next/link';
import { Check, GraduationCap } from 'lucide-react';
import { PLANS, formatInr, getPlan, isPaidPlan, type PlanId } from '@/lib/billing/plans';
import { CheckoutButton } from './checkout-button';

/** Plan grid shared by the landing page, /pricing and the Billing page. */
export function PlanCards({ paymentsEnabled, signInUrl, currentPlan, compact }: {
  paymentsEnabled: boolean; signInUrl: string; currentPlan?: PlanId; compact?: boolean;
}) {
  const currentPrice = getPlan(currentPlan)?.priceInr ?? 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map(p => (
        <div key={p.id} className={`relative flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary/50 ${p.highlight ? 'ring-2 ring-primary border-primary' : ''}`}>
          {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">Popular</span>}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            {p.studentOnly && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"><GraduationCap className="h-3 w-3" /> College email</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight">{formatInr(p.priceInr)}</span>
            <span className="text-sm text-muted-foreground">/month</span>
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
              planId={p.id}
              planName={p.name}
              enabled={paymentsEnabled}
              signInUrl={signInUrl}
              highlight={p.highlight}
              current={currentPlan === p.id}
              label={currentPrice > p.priceInr ? `Switch to ${p.name}` : undefined}
            />
          ) : currentPlan === 'free' ? (
            <button disabled className="mt-8 inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium opacity-60">Current plan</button>
          ) : (
            <Link href="/dashboard" className="mt-8 inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted">
              Get started
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
