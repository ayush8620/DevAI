import { clerkClient } from '@clerk/nextjs/server';
import { BillingRecord, CURRENCY, getPlan, isPaidPlan, nextExpiry, planAmountPaise, type PaidPlanId } from './plans';

/** Verified email addresses of a Clerk user (for the Student plan check). */
export async function verifiedEmails(userId: string): Promise<string[]> {
  const user = await (await clerkClient()).users.getUser(userId);
  return user.emailAddresses
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase());
}

/**
 * Record a successful payment on the user (Clerk publicMetadata.billing).
 * Idempotent: the browser callback and the webhook may both report the same payment.
 */
export async function activatePlan(p: {
  userId: string; planId: string; orderId: string; paymentId: string; amountPaise: number; currency?: string;
}): Promise<{ ok: true; billing: BillingRecord } | { ok: false; reason: string }> {
  if (!isPaidPlan(p.planId) || !getPlan(p.planId)) return { ok: false, reason: 'unknown plan' };
  if (p.amountPaise !== planAmountPaise(p.planId)) return { ok: false, reason: 'amount does not match the plan price' };
  if ((p.currency ?? CURRENCY) !== CURRENCY) return { ok: false, reason: 'unexpected currency' };

  const client = await clerkClient();
  const user = await client.users.getUser(p.userId);
  const existing = (user.publicMetadata as any)?.billing as Partial<BillingRecord> | undefined;
  if (existing?.paymentId === p.paymentId && existing.plan === p.planId) {
    return { ok: true, billing: existing as BillingRecord };
  }
  const now = new Date();
  // Renewing the same plan early extends it; switching plans starts a fresh period.
  const billing: BillingRecord = {
    plan: p.planId as PaidPlanId,
    status: 'active',
    activatedAt: now.toISOString(),
    expiresAt: nextExpiry(existing?.plan === p.planId ? existing : undefined, now).toISOString(),
    orderId: p.orderId,
    paymentId: p.paymentId,
    amountPaise: p.amountPaise,
    currency: CURRENCY,
  };
  await client.users.updateUserMetadata(p.userId, { publicMetadata: { billing } });
  return { ok: true, billing };
}
