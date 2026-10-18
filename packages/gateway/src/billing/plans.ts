/**
 * Plan limits the gateway enforces. Mirrors the "limits" in the dashboard's plan config
 * (packages/dashboard/src/lib/billing/plans.ts); a unit test keeps the two in sync.
 * The user's plan is stored by the dashboard in Clerk publicMetadata.billing.
 */
export type PlanId = 'free' | 'student' | 'pro' | 'team';

export interface GatewayPlanLimits {
  /** Max keys in the user's personal pool; null = unlimited */
  pooledKeys: number | null;
  /** Can create hackathon kits */
  kits: boolean;
}

export const PLAN_LIMITS: Record<PlanId, GatewayPlanLimits> = {
  free: { pooledKeys: 2, kits: false },
  student: { pooledKeys: 10, kits: false },
  pro: { pooledKeys: null, kits: false },
  team: { pooledKeys: null, kits: true },
};

const PAID: readonly string[] = ['student', 'pro', 'team'];
export type PaidPlanId = Exclude<PlanId, 'free'>;
export type BillingPeriod = 'monthly' | 'yearly';

/** Price per cycle in paise; mirrors the dashboard plan config (checked by a unit test). */
export const PLAN_PRICES_PAISE: Record<PaidPlanId, Record<BillingPeriod, number>> = {
  student: { monthly: 9_900, yearly: 99_000 },
  pro: { monthly: 49_900, yearly: 499_000 },
  team: { monthly: 199_900, yearly: 1_999_000 },
};

export function isPaidPlanId(p: unknown): p is PaidPlanId {
  return typeof p === 'string' && PAID.includes(p);
}

/**
 * Subscription statuses that keep the paid plan until expiresAt (the end of the paid
 * period). Same list as ACCESS_STATUSES in the dashboard's plans.ts.
 */
export const ACCESS_STATUSES: readonly string[] = ['active', 'authenticated', 'pending', 'halted', 'cancelled', 'completed'];

/** Same rule as the dashboard: a paid record with access and an unexpired period, otherwise Free. */
export function planFromBilling(billing: unknown, now: Date = new Date()): PlanId {
  const b = billing as { plan?: unknown; status?: unknown; expiresAt?: unknown } | null | undefined;
  if (!b || typeof b.plan !== 'string' || !PAID.includes(b.plan) || typeof b.status !== 'string' || !ACCESS_STATUSES.includes(b.status) || typeof b.expiresAt !== 'string') return 'free';
  const exp = new Date(b.expiresAt);
  return Number.isFinite(exp.getTime()) && exp > now ? (b.plan as PlanId) : 'free';
}

/** Allowlisted admins (ADMIN_EMAILS / ADMIN_USER_IDS) run the gateway, so they get the Team limits. */
export function limitsFor(plan: PlanId, isAdmin = false): GatewayPlanLimits {
  return isAdmin ? PLAN_LIMITS.team : PLAN_LIMITS[plan];
}

export function canAddPooledKey(limits: GatewayPlanLimits, currentCount: number): boolean {
  return limits.pooledKeys === null || currentCount < limits.pooledKeys;
}
