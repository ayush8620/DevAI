import { clerkClient } from '@clerk/nextjs/server';
import type { BillingRecord } from './plans';
import { applyBillingEvent, followUps, type BillingEvent, type Transition } from './subscription';
import { cancelSubscription } from './razorpay';
import { confirmRedemption } from './coupons-client';

/** Verified email addresses of a Clerk user (for the Student plan check). */
export async function verifiedEmails(userId: string): Promise<string[]> {
  const user = await (await clerkClient()).users.getUser(userId);
  return user.emailAddresses
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase());
}

export async function readBilling(userId: string): Promise<Partial<BillingRecord> | null> {
  const user = await (await clerkClient()).users.getUser(userId);
  return ((user.publicMetadata as any)?.billing as Partial<BillingRecord> | undefined) ?? null;
}

export async function writeBilling(userId: string, billing: BillingRecord): Promise<void> {
  // updateUserMetadata merges top-level keys, so other publicMetadata keys are kept.
  await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { billing } });
}

/**
 * Apply a subscription event to the user's stored plan, then run the follow-ups:
 * cancel the subscription this one replaces (plan change) and confirm a coupon redemption.
 * Follow-up failures are logged, not thrown: the plan write is what matters, and
 * Razorpay retries webhooks that fail.
 */
export async function applyAndPersist(userId: string, ev: BillingEvent, opts: { sessionToken?: string | null } = {}): Promise<Transition> {
  const existing = await readBilling(userId);
  const t = applyBillingEvent(existing, ev);
  if (t.action === 'write') await writeBilling(userId, t.billing);
  if (t.action === 'write' || ev.name === 'verify') {
    const f = followUps(ev);
    if (f.cancel && existing?.subscriptionId === f.cancel.subscriptionId) {
      try { await cancelSubscription(f.cancel.subscriptionId, f.cancel.atCycleEnd); }
      catch (err: any) { console.warn('Cancelling the replaced subscription failed (it may already be cancelled):', err?.message); }
    }
    if (f.confirmRedemption) {
      try { await confirmRedemption(f.confirmRedemption.redemptionId, f.confirmRedemption.subscriptionId, opts.sessionToken ?? null); }
      catch (err: any) { console.warn('Coupon redemption confirm failed:', err?.message); }
    }
  }
  return t;
}
