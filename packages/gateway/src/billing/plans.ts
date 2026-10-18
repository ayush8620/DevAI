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

/** Same rule as the dashboard: an active, unexpired paid record, otherwise Free. */
export function planFromBilling(billing: unknown, now: Date = new Date()): PlanId {
  const b = billing as { plan?: unknown; status?: unknown; expiresAt?: unknown } | null | undefined;
  if (!b || typeof b.plan !== 'string' || !PAID.includes(b.plan) || b.status !== 'active' || typeof b.expiresAt !== 'string') return 'free';
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
