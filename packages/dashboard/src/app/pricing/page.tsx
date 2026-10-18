import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus, GraduationCap, ShieldCheck } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/landing/site-chrome';
import { PlanCards } from '@/components/billing/plan-cards';
import { PLANS, formatInr, BILLING_PERIOD_DAYS, CURRENCY } from '@/lib/billing/plans';
import { paymentsEnabled } from '@/lib/billing/razorpay';
import { SIGN_IN_URL } from '@/lib/clerk';
import { pageMetadata, jsonLd, SITE_URL, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Pricing in INR: Free, Student, Pro and Team plans',
  description: `DevAI AI API gateway pricing in rupees: ${PLANS.map(p => `${p.name} ${p.priceInr ? `${formatInr(p.priceInr)}/month` : '₹0'}`).join(', ')}. Student plan for college emails, hackathon API keys on Team. Bring your own key; pay with Razorpay (UPI, cards, netbanking).`,
  path: '/pricing',
});

// Read the Razorpay env vars at request time, so adding keys only needs a redeploy of env, not code.
export const dynamic = 'force-dynamic';

const compare: { label: string; values: (string | boolean)[] }[] = [
  { label: 'Requests per day', values: PLANS.map(p => p.limits.requestsPerDay.toLocaleString('en-IN')) },
  { label: 'Projects', values: PLANS.map(p => String(p.limits.projects)) },
  { label: 'Provider API keys', values: PLANS.map(p => String(p.limits.providerKeys)) },
  { label: 'Your own provider keys (BYOK)', values: PLANS.map(p => p.limits.pooledKeys === null ? 'Unlimited' : `${p.limits.pooledKeys} keys`) },
  { label: 'Hackathon kits (capped, expiring team keys)', values: PLANS.map(p => p.limits.kits) },
  { label: 'OpenAI-compatible API + streaming', values: [true, true, true, true] },
  { label: 'Automatic key & provider failover', values: [true, true, true, true] },
  { label: 'Key strategies (round robin, random, least used)', values: [false, true, true, true] },
  { label: 'fastest / best parallel routing', values: [false, true, true, true] },
  { label: 'Response caching', values: [false, true, true, true] },
  { label: 'Per-project routing defaults', values: [false, false, true, true] },
  { label: 'Per-key token quotas', values: [false, false, true, true] },
  { label: 'Audit log', values: [false, false, false, true] },
  { label: 'Support', values: PLANS.map(p => p.support) },
];

const faqs = [
  ['How do I pay?', 'Checkout runs on Razorpay: UPI, debit and credit cards, netbanking and wallets. You need to be signed in so the plan is added to your account.'],
  ['Is it a subscription?', `No auto-debit. One payment gives ${BILLING_PERIOD_DAYS} days of the plan; paying again before it ends adds another ${BILLING_PERIOD_DAYS} days.`],
  ['Who can use the Student plan?', 'Anyone with a verified college email on their account, such as an address ending in .edu or .ac.in. Add it under your account settings before upgrading.'],
  ['Do I still pay the AI providers?', 'Yes. DevAI is bring-your-own-key: every request runs on provider API keys you add yourself, so provider usage is billed by each provider under your own account. Free tiers (Gemini, Groq, OpenRouter :free models) work too. DevAI never lends you shared keys.'],
  ['Which providers can I use?', 'Any you have a key for: OpenAI, Anthropic, Google Gemini, Groq, OpenRouter and Mistral. Add as many keys as your plan allows; DevAI rotates and fails over between them.'],
];

export default function PricingPage() {
  const enabled = paymentsEnabled();
  // SoftwareApplication with one Offer per plan, straight from lib/billing/plans.ts
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${SITE_NAME} Gateway`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: 'OpenAI-compatible AI API gateway and LLM router that runs on your own provider keys, with failover, key rotation, caching and usage analytics.',
    offers: PLANS.map(p => ({
      '@type': 'Offer',
      name: p.name,
      description: p.tagline,
      price: p.priceInr.toFixed(2),
      priceCurrency: CURRENCY,
      url: `${SITE_URL}/pricing`,
      availability: 'https://schema.org/InStock',
      ...(p.priceInr > 0 ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: p.priceInr.toFixed(2), priceCurrency: CURRENCY, billingDuration: `P${BILLING_PERIOD_DAYS}D`, unitText: `${BILLING_PERIOD_DAYS} days` } } : {}),
    })),
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <SiteHeader active="/pricing" />

      <main>
        <section className="relative overflow-hidden px-5 sm:px-8 pt-14 pb-10 sm:pt-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-[-10rem] h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] opacity-40" />
          </div>
          <div className="mx-auto max-w-6xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">Plans that grow with your app</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              Start free. Upgrade when you need more requests, projects and keys. Prices are in Indian rupees, per {BILLING_PERIOD_DAYS} days.
            </p>
            {!enabled && (
              <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Online payments are coming soon. The Free plan is available now.
              </p>
            )}
          </div>
        </section>

        <section className="px-5 sm:px-8 pb-16">
          <div className="mx-auto max-w-6xl">
            <PlanCards paymentsEnabled={enabled} signInUrl={SIGN_IN_URL} />
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-6 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Secure checkout by Razorpay</span>
              <span className="inline-flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-primary" /> Student plan needs a verified .edu / .ac.in email</span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              DevAI is in beta: plan limits and feature tiers are being rolled out in the gateway, so some limits are not enforced yet. The key-pool size and hackathon kits are already enforced. Your plan and its expiry date are shown on the Billing page.
            </p>
          </div>
        </section>

        <section className="border-t bg-muted/20 px-5 sm:px-8 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Compare</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">What each plan includes</h2>
            <div className="mt-8 overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Feature</th>
                    {PLANS.map(p => (
                      <th key={p.id} className="px-4 py-3 text-left">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs font-normal text-muted-foreground">{formatInr(p.priceInr)}/mo</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {compare.map(row => (
                    <tr key={row.label}>
                      <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className="px-4 py-3">
                          {v === true ? <Check className="h-4 w-4 text-primary" aria-label="Included" />
                            : v === false ? <Minus className="h-4 w-4 text-muted-foreground/50" aria-label="Not included" />
                            : <span className="font-medium">{v}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="px-5 sm:px-8 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">FAQ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Questions</h2>
            <div className="mt-8 divide-y rounded-xl border bg-card">
              {faqs.map(([q, a]) => (
                <details key={q} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium flex items-center justify-between gap-4">
                    {q}<span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</p>
                </details>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account? <Link href="/dashboard/billing" className="font-medium text-primary hover:underline">Manage your plan</Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
