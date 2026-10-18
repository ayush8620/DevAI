/**
 * DevAI plans: the ONE place prices and plan features are defined.
 * The server reads amounts from here when it creates a Razorpay order; the client
 * never sends an amount. Prices are in Indian rupees, billed monthly.
 */

export type PlanId = 'free' | 'student' | 'pro' | 'team';
export const PAID_PLAN_IDS = ['student', 'pro', 'team'] as const;
export type PaidPlanId = typeof PAID_PLAN_IDS[number];

export interface PlanLimits {
  /** Chat completion requests per day through the gateway */
  requestsPerDay: number;
  /** Projects (each with its own dvai_ keys, routing defaults and usage stats) */
  projects: number;
  /** Provider API keys that can be added in total */
  providerKeys: number;
  /** Own keys in the personal key pool (enforced by the gateway); null = unlimited */
  pooledKeys: number | null;
  /** Can create hackathon kits (enforced by the gateway) */
  kits: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in rupees (0 for Free) */
  priceInr: number;
  tagline: string;
  limits: PlanLimits;
  features: string[];
  support: string;
  /** Requires a verified college email (.edu, .ac.in, ...) */
  studentOnly?: boolean;
  highlight?: boolean;
}

export const CURRENCY = 'INR';
/** Days of access one payment buys. */
export const BILLING_PERIOD_DAYS = 30;

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    tagline: 'For trying DevAI and side projects.',
    limits: { requestsPerDay: 100, projects: 1, providerKeys: 2, pooledKeys: 2, kits: false },
    features: [
      'OpenAI-compatible endpoint with streaming',
      'All providers: Gemini, OpenAI, Anthropic, Groq, Ollama',
      'Automatic failover across keys and providers',
      'Personal key pool: rotate up to 2 of your own free keys',
      'Failover key strategy',
      'Usage dashboard',
    ],
    support: 'Community support (GitHub issues)',
  },
  {
    id: 'student',
    name: 'Student',
    priceInr: 99,
    tagline: 'For students learning to build with AI.',
    limits: { requestsPerDay: 2_000, projects: 3, providerKeys: 5, pooledKeys: 10, kits: false },
    features: [
      'Everything in Free',
      'Personal key pool with up to 10 of your own free keys',
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

/** Amount for a Razorpay order, in paise (₹1 = 100 paise). Throws for unknown or free plans. */
export function planAmountPaise(id: unknown): number {
  const plan = getPlan(id);
  if (!plan || !isPaidPlan(plan.id)) throw new Error(`Not a paid plan: ${String(id)}`);
  return Math.round(plan.priceInr * 100);
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

/** What is stored on the user (Clerk publicMetadata.billing). */
export interface BillingRecord {
  plan: PaidPlanId;
  status: 'active';
  /** ISO timestamps */
  activatedAt: string;
  expiresAt: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
}

/** Current plan from stored billing metadata: an expired or missing record means Free. */
export function currentPlanId(billing: unknown, now: Date = new Date()): PlanId {
  const b = billing as Partial<BillingRecord> | null | undefined;
  if (!b || !isPaidPlan(b.plan) || b.status !== 'active' || !b.expiresAt) return 'free';
  const exp = new Date(b.expiresAt);
  return Number.isFinite(exp.getTime()) && exp > now ? b.plan : 'free';
}

/** New expiry: extends from the current expiry when renewing early, else from now. */
export function nextExpiry(existing: unknown, now: Date = new Date()): Date {
  const b = existing as Partial<BillingRecord> | null | undefined;
  const cur = b?.expiresAt ? new Date(b.expiresAt) : null;
  const base = cur && Number.isFinite(cur.getTime()) && cur > now ? cur : now;
  return new Date(base.getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}
