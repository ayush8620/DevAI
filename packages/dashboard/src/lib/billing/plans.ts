/**
 * DevAI plans: the ONE place prices and plan features are defined.
 * Paid plans are Razorpay Subscriptions that renew automatically (monthly, or yearly with
 * two months free). The Razorpay plan ids come from env vars (see razorpayPlanEnvVar);
 * the browser never sends an amount. Prices are in Indian rupees.
 */

export type PlanId = 'free' | 'student' | 'pro' | 'team';
export const PAID_PLAN_IDS = ['student', 'pro', 'team'] as const;
export type PaidPlanId = typeof PAID_PLAN_IDS[number];
export type BillingPeriod = 'monthly' | 'yearly';
export const BILLING_PERIODS: readonly BillingPeriod[] = ['monthly', 'yearly'];

export interface PlanLimits {
  /** Chat completion requests per day through the gateway */
  requestsPerDay: number;
  /** Projects (each with its own dvai_ keys, routing defaults and usage stats) */
  projects: number;
  /** Provider API keys that can be added in total */
  providerKeys: number;
  /** User's own provider keys (bring your own key; enforced by the gateway); null = unlimited */
  pooledKeys: number | null;
  /** Can create hackathon kits (enforced by the gateway) */
  kits: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in rupees (0 for Free) */
  priceInr: number;
  /** Yearly price in rupees: 10 x monthly, i.e. two months free (0 for Free) */
  priceInrYearly: number;
  tagline: string;
  limits: PlanLimits;
  features: string[];
  support: string;
  /** Requires a verified college email (.edu, .ac.in, ...) */
  studentOnly?: boolean;
  highlight?: boolean;
}

export const CURRENCY = 'INR';
/** Yearly billing = 10 monthly payments (2 months free, about 17% off). */
export const YEARLY_MONTHS_CHARGED = 10;
/** Billing cycles a subscription is created for (Razorpay needs a total_count): 10 years. */
export const TOTAL_CYCLES: Record<BillingPeriod, number> = { monthly: 120, yearly: 10 };

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    priceInrYearly: 0,
    tagline: 'For trying DevAI and side projects.',
    limits: { requestsPerDay: 100, projects: 1, providerKeys: 2, pooledKeys: 2, kits: false },
    features: [
      'OpenAI-compatible endpoint with streaming',
      'Bring your own key: OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral',
      'Automatic failover across keys and providers',
      'Up to 2 of your own provider keys, rotated automatically',
      'Failover key strategy',
      'Usage dashboard',
    ],
    support: 'Community support (GitHub issues)',
  },
  {
    id: 'student',
    name: 'Student',
    priceInr: 99,
    priceInrYearly: 990,
    tagline: 'For students learning to build with AI.',
    limits: { requestsPerDay: 2_000, projects: 3, providerKeys: 5, pooledKeys: 10, kits: false },
    features: [
      'Everything in Free',
      'Up to 10 of your own provider keys',
      'All key strategies: failover, round robin, random, least used',
      'fastest and best parallel routing modes',
      'Response caching',
    ],
    support: 'Email support',
    studentOnly: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceInr: 499,
    priceInrYearly: 4_990,
    tagline: 'For individual developers shipping apps.',
    limits: { requestsPerDay: 20_000, projects: 10, providerKeys: 20, pooledKeys: null, kits: false },
    features: [
      'Everything in Student',
      'Unlimited keys in your personal pool',
      'Per-project routing defaults (mode, provider priority, judge, timeout)',
      'Per-key token quotas',
      'Usage analytics by provider, model and project',
    ],
    support: 'Priority email support',
    highlight: true,
  },
  {
    id: 'team',
    name: 'Team',
    priceInr: 1_999,
    priceInrYearly: 19_990,
    tagline: 'For teams sharing providers, keys and analytics.',
    limits: { requestsPerDay: 100_000, projects: 50, providerKeys: 100, pooledKeys: null, kits: true },
    features: [
      'Everything in Pro',
      'Hackathon kits: temporary team keys with request/token caps, expiry and a share page',
      'Shared providers and keys across the team’s projects',
      'Audit log of admin changes',
    ],
    support: 'Priority support',
  },
];

export function getPlan(id: unknown): Plan | undefined {
  return typeof id === 'string' ? PLANS.find(p => p.id === id) : undefined;
}

export function isPaidPlan(id: unknown): id is PaidPlanId {
  return typeof id === 'string' && (PAID_PLAN_IDS as readonly string[]).includes(id);
}

export function isBillingPeriod(p: unknown): p is BillingPeriod {
  return p === 'monthly' || p === 'yearly';
}

/** Price per billing cycle in rupees. */
export function planPriceInr(plan: Plan, period: BillingPeriod = 'monthly'): number {
  return period === 'yearly' ? plan.priceInrYearly : plan.priceInr;
}

/** Amount charged per cycle, in paise (₹1 = 100 paise). Throws for unknown or free plans. */
export function planAmountPaise(id: unknown, period: BillingPeriod = 'monthly'): number {
  const plan = getPlan(id);
  if (!plan || !isPaidPlan(plan.id)) throw new Error(`Not a paid plan: ${String(id)}`);
  if (!isBillingPeriod(period)) throw new Error(`Unknown billing period: ${String(period)}`);
  return Math.round(planPriceInr(plan, period) * 100);
}

/** What a yearly plan costs per month, rounded to the rupee ("₹83/mo"). */
export function yearlyMonthlyEquivalent(plan: Plan): number {
  return Math.round(plan.priceInrYearly / 12);
}

/** Percent saved by paying yearly vs 12 monthly payments (17 for "2 months free"). */
export function yearlySavingsPercent(plan: Plan): number {
  if (!plan.priceInr) return 0;
  return Math.round((1 - plan.priceInrYearly / (plan.priceInr * 12)) * 100);
}

/** Env var holding the Razorpay plan id: RAZORPAY_PLAN_ID_PRO, RAZORPAY_PLAN_ID_PRO_YEARLY, ... */
export function razorpayPlanEnvVar(id: PaidPlanId, period: BillingPeriod): string {
  return `RAZORPAY_PLAN_ID_${id.toUpperCase()}${period === 'yearly' ? '_YEARLY' : ''}`;
}

/** The Razorpay plan id for a plan + period, or '' when that env var is not set. */
export function razorpayPlanId(id: PaidPlanId, period: BillingPeriod, env: Record<string, string | undefined> = process.env): string {
  return env[razorpayPlanEnvVar(id, period)]?.trim() || '';
}

/** "student_monthly" -> is a Razorpay plan id configured for it? Passed from the server to the UI. */
export type ConfiguredPlans = Partial<Record<`${PaidPlanId}_${BillingPeriod}`, boolean>>;

export function configuredPlans(env: Record<string, string | undefined> = process.env): ConfiguredPlans {
  const out: ConfiguredPlans = {};
  for (const id of PAID_PLAN_IDS) for (const period of BILLING_PERIODS) out[`${id}_${period}`] = Boolean(razorpayPlanId(id, period, env));
  return out;
}

/** "₹1,999" */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * College email check for the Student plan: .edu (and country variants like .edu.in)
 * or .ac.in / .ac.<country> academic domains. Only verified emails should be passed in.
 */
export function isStudentEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.startsWith('.') || domain.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  if (tld === 'edu') return true;
  // edu.in, edu.au, ac.in, ac.uk ... (needs a name before it: iitd.ac.in)
  return labels.length >= 3 && (sld === 'edu' || sld === 'ac') && /^[a-z]{2}$/.test(tld);
}

/** Razorpay subscription states (https://razorpay.com/docs/payments/subscriptions/states/). */
export type SubscriptionStatus =
  | 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused';

/**
 * What is stored on the user (Clerk publicMetadata.billing). The gateway reads plan, status
 * and expiresAt (packages/gateway/src/billing/plans.ts), so keep those three names.
 */
export interface BillingRecord {
  plan: PaidPlanId;
  period: BillingPeriod;
  status: SubscriptionStatus;
  /** End of the paid period (ISO). Access lasts until then, also after cancel or halt. */
  expiresAt: string;
  /** Start of the current period (ISO), when known */
  currentStart?: string | null;
  subscriptionId: string;
  /** Cancel was requested; the plan ends at expiresAt and does not renew */
  cancelAtPeriodEnd?: boolean;
  lastPaymentId?: string | null;
  /** Last failed payment (payment.failed), cleared on the next successful charge */
  lastPaymentError?: string | null;
  /** Plan change scheduled for the end of the current period (a second subscription) */
  scheduled?: { subscriptionId: string; plan: PaidPlanId; period: BillingPeriod; startsAt: string | null } | null;
  /** Coupon applied to this subscription */
  coupon?: { code: string; duration: 'first_cycle' | 'forever' } | null;
  /** Idempotency / ordering of webhook events */
  lastEventId?: string | null;
  lastEventAt?: number | null;
  updatedAt: string;
}

/**
 * Statuses that keep the paid plan until expiresAt. pending/halted = renewal payment
 * failing (Razorpay retries); cancelled/completed = no renewal. After expiresAt all of
 * them fall back to Free. 'authenticated' = mandate set up, first cycle paid upfront
 * (coupon) or starting later (plan change). Records from the old one-time orders used
 * status 'active' too, so they keep working until they expire.
 */
export const ACCESS_STATUSES: readonly string[] = ['active', 'authenticated', 'pending', 'halted', 'cancelled', 'completed'];

/** Current plan from stored billing metadata: an expired or missing record means Free. */
export function currentPlanId(billing: unknown, now: Date = new Date()): PlanId {
  const b = billing as Partial<BillingRecord> | null | undefined;
  if (!b || !isPaidPlan(b.plan) || typeof b.status !== 'string' || !ACCESS_STATUSES.includes(b.status) || !b.expiresAt) return 'free';
  const exp = new Date(b.expiresAt);
  return Number.isFinite(exp.getTime()) && exp > now ? b.plan : 'free';
}

/** Will the plan renew automatically? */
export function renews(billing: Partial<BillingRecord> | null | undefined): boolean {
  return Boolean(billing && (billing.status === 'active' || billing.status === 'authenticated' || billing.status === 'pending') && !billing.cancelAtPeriodEnd);
}

/** Monthly-equivalent price, to decide whether a change is an upgrade (now) or a downgrade (at period end). */
export function monthlyValue(id: PlanId, period: BillingPeriod = 'monthly'): number {
  const plan = getPlan(id);
  if (!plan) return 0;
  return period === 'yearly' ? plan.priceInrYearly / 12 : plan.priceInr;
}
