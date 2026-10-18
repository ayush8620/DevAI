import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { applyBillingEvent, followUps, parseWebhookEvent, type BillingEvent, type RazorpaySubscriptionEntity } from '../src/lib/billing/subscription';
import { planSubscription } from '../src/lib/billing/checkout';
import { currentPlanId, type BillingRecord } from '../src/lib/billing/plans';

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0); // 18 Oct 2026 08:00 UTC
const now = new Date(T0);
const s = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400_000;

function sub(over: Partial<RazorpaySubscriptionEntity> = {}, notes: Record<string, string> = {}): RazorpaySubscriptionEntity {
  return {
    id: 'sub_A', plan_id: 'plan_pro', status: 'active', current_start: s(T0), current_end: s(T0 + 30 * DAY),
    notes: { userId: 'user_1', planId: 'pro', period: 'monthly', ...notes }, ...over,
  };
}
const ev = (name: BillingEvent['name'], subscription: RazorpaySubscriptionEntity, extra: Partial<BillingEvent> = {}): BillingEvent =>
  ({ name, subscription, id: `evt_${Math.random()}`, createdAt: s(T0), ...extra });

function apply(existing: Partial<BillingRecord> | null, e: BillingEvent, at = now): BillingRecord {
  const t = applyBillingEvent(existing, e, at);
  return (t.action === 'write' ? t.billing : existing) as BillingRecord;
}

describe('webhook state transitions', () => {
  it('subscription.activated sets plan, status and the period end', () => {
    const b = apply(null, ev('subscription.activated', sub()))!;
    expect(b).toMatchObject({ plan: 'pro', period: 'monthly', status: 'active', subscriptionId: 'sub_A', cancelAtPeriodEnd: false });
    expect(b.expiresAt).toBe(new Date(s(T0 + 30 * DAY) * 1000).toISOString());
    expect(currentPlanId(b, now)).toBe('pro');
  });

  it('subscription.charged extends the period and clears a payment error', () => {
    let b = apply(null, ev('subscription.activated', sub()))!;
    b = apply(b, ev('payment.failed', sub(), { paymentError: 'Insufficient balance', createdAt: s(T0 + DAY) }))!;
    expect(b.lastPaymentError).toBe('Insufficient balance');
    expect(b.status).toBe('active');
    b = apply(b, ev('subscription.charged', sub({ current_start: s(T0 + 30 * DAY), current_end: s(T0 + 60 * DAY) }), { createdAt: s(T0 + 30 * DAY), paymentId: 'pay_2' }))!;
    expect(b).toMatchObject({ status: 'active', lastPaymentId: 'pay_2', lastPaymentError: null });
    expect(new Date(b.expiresAt).getTime()).toBe(s(T0 + 60 * DAY) * 1000);
  });

  it('pending and halted keep access until the period end, then Free', () => {
    let b = apply(null, ev('subscription.activated', sub()))!;
    b = apply(b, ev('subscription.pending', sub({ status: 'pending' }), { createdAt: s(T0 + 30 * DAY) }))!;
    expect(b.status).toBe('pending');
    expect(currentPlanId(b, new Date(T0 + 29 * DAY))).toBe('pro');
    b = apply(b, ev('subscription.halted', sub({ status: 'halted' }), { createdAt: s(T0 + 33 * DAY) }))!;
    expect(b.status).toBe('halted');
    expect(currentPlanId(b, new Date(T0 + 31 * DAY))).toBe('free');
  });

  it('cancelled: plan stays until the end of the paid period, then Free', () => {
    let b = apply(null, ev('subscription.activated', sub()))!;
    b = apply(b, ev('subscription.cancelled', sub({ status: 'cancelled' }), { createdAt: s(T0 + 5 * DAY) }))!;
    expect(b).toMatchObject({ status: 'cancelled', cancelAtPeriodEnd: true });
    expect(currentPlanId(b, new Date(T0 + 10 * DAY))).toBe('pro');
    expect(currentPlanId(b, new Date(T0 + 31 * DAY))).toBe('free');
  });

  it('completed ends after the last period', () => {
    let b = apply(null, ev('subscription.activated', sub()))!;
    b = apply(b, ev('subscription.completed', sub({ status: 'completed' }), { createdAt: s(T0 + 30 * DAY) }))!;
    expect(b.status).toBe('completed');
    expect(currentPlanId(b, new Date(T0 + 31 * DAY))).toBe('free');
  });

  it('is idempotent and ignores out-of-order events', () => {
    const first = ev('subscription.activated', sub(), { id: 'evt_1', createdAt: s(T0) + 10 });
    const b = apply(null, first)!;
    expect(applyBillingEvent(b, first, now)).toMatchObject({ action: 'ignore', reason: 'duplicate event' });
    const stale = ev('subscription.pending', sub({ status: 'pending' }), { id: 'evt_0', createdAt: s(T0) });
    expect(applyBillingEvent(b, stale, now).action).toBe('ignore');
  });

  it('never moves the period end backwards', () => {
    let b = apply(null, ev('subscription.charged', sub({ current_end: s(T0 + 60 * DAY) })))!;
    b = apply(b, ev('verify', sub({ current_end: s(T0 + 30 * DAY) }), { id: null, createdAt: null }))!;
    expect(new Date(b.expiresAt).getTime()).toBe(s(T0 + 60 * DAY) * 1000);
  });

  it('ignores events without DevAI notes and failures of other subscriptions', () => {
    expect(applyBillingEvent(null, ev('subscription.activated', sub({}, { userId: '', planId: 'pro' })), now).action).toBe('ignore');
    const b = apply(null, ev('subscription.activated', sub()))!;
    expect(applyBillingEvent(b, ev('subscription.halted', sub({ id: 'sub_OLD', status: 'halted' })), now).action).toBe('ignore');
    expect(applyBillingEvent(b, ev('subscription.cancelled', sub({ id: 'sub_OLD', status: 'cancelled' })), now).action).toBe('ignore');
    expect(applyBillingEvent(b, ev('payment.failed', sub({ id: 'sub_OLD' })), now).action).toBe('ignore');
  });

  it('upgrade: the new subscription takes over and the old one is cancelled now', () => {
    const b = apply(null, ev('subscription.activated', sub()))!;
    const team = sub({ id: 'sub_B', plan_id: 'plan_team' }, { planId: 'team', replaces: 'sub_A', changeMode: 'now' });
    const e = ev('subscription.activated', team, { createdAt: s(T0 + DAY) });
    const after = apply(b, e)!;
    expect(after).toMatchObject({ plan: 'team', subscriptionId: 'sub_B', status: 'active' });
    expect(followUps(e)).toEqual({ cancel: { subscriptionId: 'sub_A', atCycleEnd: false } });
    // The old subscription's cancellation must not downgrade the new plan.
    expect(applyBillingEvent(after, ev('subscription.cancelled', sub({ status: 'cancelled' }), { createdAt: s(T0 + DAY + 5) }), now).action).toBe('ignore');
  });

  it('downgrade: scheduled until the current period ends, then takes over', () => {
    const b = apply(null, ev('subscription.activated', sub()))!;
    const start = s(T0 + 30 * DAY);
    const student = sub({ id: 'sub_C', status: 'authenticated', current_start: null, current_end: null, start_at: start }, { planId: 'student', replaces: 'sub_A', changeMode: 'cycle_end' });
    const auth = ev('subscription.authenticated', student, { createdAt: s(T0 + DAY) });
    const scheduled = apply(b, auth)!;
    expect(scheduled).toMatchObject({ plan: 'pro', subscriptionId: 'sub_A', scheduled: { subscriptionId: 'sub_C', plan: 'student', period: 'monthly' } });
    expect(followUps(auth)).toEqual({ cancel: { subscriptionId: 'sub_A', atCycleEnd: true } });
    const cancelledOld = apply(scheduled, ev('subscription.cancelled', sub({ status: 'cancelled' }), { createdAt: start }))!;
    expect(cancelledOld.status).toBe('cancelled');
    const active = apply(cancelledOld, ev('subscription.activated', { ...student, status: 'active', current_start: start, current_end: start + 30 * 86_400 }, { createdAt: start + 10 }), new Date(start * 1000 + 10_000))!;
    expect(active).toMatchObject({ plan: 'student', subscriptionId: 'sub_C', status: 'active', scheduled: null });
  });

  it('first-cycle coupon: authenticated with the cycle paid upfront grants access until start_at', () => {
    const start = s(T0 + 30 * DAY);
    const s1 = sub({ status: 'authenticated', current_start: null, current_end: null, start_at: start }, { upfrontCycle: '1', coupon: 'LAUNCH20', couponDuration: 'first_cycle', redemptionId: 'red_1' });
    const e = ev('verify', s1, { id: null, createdAt: null });
    const b = apply(null, e)!;
    expect(b).toMatchObject({ plan: 'pro', status: 'authenticated', coupon: { code: 'LAUNCH20', duration: 'first_cycle' } });
    expect(new Date(b.expiresAt).getTime()).toBe(start * 1000);
    expect(currentPlanId(b, new Date(T0 + DAY))).toBe('pro');
    expect(followUps(e)).toEqual({ confirmRedemption: { redemptionId: 'red_1', subscriptionId: 'sub_A' } });
  });

  it('parses webhook bodies and skips other events', () => {
    const body = { event: 'subscription.charged', created_at: 1700000000, payload: { subscription: { entity: sub() }, payment: { entity: { id: 'pay_1' } } } };
    expect(parseWebhookEvent(body, 'evt_x')).toMatchObject({ name: 'subscription.charged', id: 'evt_x', paymentId: 'pay_1', createdAt: 1700000000, subscriptionIdHint: 'sub_A' });
    expect(parseWebhookEvent({ event: 'order.paid' })).toBeNull();
    const failed = parseWebhookEvent({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_9', invoice_id: 'inv_1', error_description: 'Card declined' } } } });
    expect(failed).toMatchObject({ paymentError: 'Card declined', invoiceId: 'inv_1', subscription: undefined });
  });
});

describe('planning a subscription', () => {
  const base = { userId: 'user_1', razorpayPlanId: 'plan_x', now };
  const activePro: Partial<BillingRecord> = { plan: 'pro', period: 'monthly', status: 'active', subscriptionId: 'sub_A', expiresAt: new Date(T0 + 20 * DAY).toISOString() };

  it('new subscription starts now and charges the plan amount', () => {
    const r = planSubscription({ ...base, planId: 'pro', period: 'yearly' });
    expect(r.ok && r.value).toMatchObject({ mode: 'new', planId: 'plan_x', total_count: 10, firstChargePaise: 499_000, notes: { userId: 'user_1', planId: 'pro', period: 'yearly' } });
    expect(r.ok && r.value.start_at).toBeUndefined();
  });
  it('refuses the plan you already have', () => {
    expect(planSubscription({ ...base, planId: 'pro', period: 'monthly', existing: activePro }).ok).toBe(false);
  });
  it('upgrade replaces now; downgrade starts at period end', () => {
    const up = planSubscription({ ...base, planId: 'team', period: 'monthly', existing: activePro });
    expect(up.ok && up.value).toMatchObject({ mode: 'now', notes: { replaces: 'sub_A', changeMode: 'now' } });
    const down = planSubscription({ ...base, planId: 'student', period: 'monthly', existing: activePro });
    expect(down.ok && down.value).toMatchObject({ mode: 'cycle_end', start_at: s(T0 + 20 * DAY), firstChargePaise: 500, notes: { changeMode: 'cycle_end' } });
    const toYearly = planSubscription({ ...base, planId: 'pro', period: 'yearly', existing: activePro });
    expect(toYearly.ok && toYearly.value.mode).toBe('cycle_end'); // cheaper per month
  });
  it('first-cycle coupon: upfront discounted amount, full price from the next cycle', () => {
    const coupon = { code: 'LAUNCH20', kind: 'percent' as const, percentOff: 20, amountOffPaise: null, duration: 'first_cycle' as const, razorpayOfferId: null, basePaise: 49_900, discountPaise: 9_980, finalPaise: 39_920, redemptionId: 'red_1' };
    const r = planSubscription({ ...base, planId: 'pro', period: 'monthly', coupon });
    expect(r.ok && r.value).toMatchObject({ firstChargePaise: 39_920, recurringPaise: 49_900, start_at: s(T0) + 30 * 86_400, addons: [{ item: { amount: 39_920, currency: 'INR' } }], notes: { upfrontCycle: '1', coupon: 'LAUNCH20', redemptionId: 'red_1' } });
    // Not combinable with a change that starts later
    expect(planSubscription({ ...base, planId: 'student', period: 'monthly', existing: activePro, coupon }).ok).toBe(false);
  });
  it('forever coupon: a discounted plan; Razorpay offer when configured', () => {
    const coupon = { code: 'FOREVER10', kind: 'percent' as const, percentOff: 10, amountOffPaise: null, duration: 'forever' as const, razorpayOfferId: null, basePaise: 49_900, discountPaise: 4_990, finalPaise: 44_910, redemptionId: 'red_2' };
    const r = planSubscription({ ...base, planId: 'pro', period: 'monthly', coupon });
    expect(r.ok && r.value).toMatchObject({ planId: null, discountedAmountPaise: 44_910, recurringPaise: 44_910 });
    const o = planSubscription({ ...base, planId: 'pro', period: 'monthly', coupon: { ...coupon, razorpayOfferId: 'offer_ABC123' } });
    expect(o.ok && o.value).toMatchObject({ planId: 'plan_x', offer_id: 'offer_ABC123' });
  });
});

// ---- Webhook route end to end (Clerk mocked, signature real) ----
const store = new Map<string, any>();
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => ({ id, publicMetadata: store.get(id) ?? {}, emailAddresses: [] }),
      updateUserMetadata: async (id: string, { publicMetadata }: any) => { store.set(id, { ...(store.get(id) ?? {}), ...publicMetadata }); },
    },
  }),
  auth: async () => ({ userId: null, getToken: async () => null }),
}));

describe('POST /api/billing/webhook', () => {
  const SECRET = 'whsec_test_not_real';
  beforeEach(() => { store.clear(); process.env.RAZORPAY_WEBHOOK_SECRET = SECRET; delete process.env.RAZORPAY_KEY_SECRET; });

  async function post(body: unknown, opts: { sig?: string; id?: string } = {}) {
    const { POST } = await import('../src/app/api/billing/webhook/route');
    const raw = JSON.stringify(body);
    const sig = opts.sig ?? createHmac('sha256', SECRET).update(raw).digest('hex');
    const res = await POST(new Request('http://x/api/billing/webhook', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': opts.id ?? `evt_${Math.random()}` } }));
    return { status: res.status, json: await res.json() };
  }

  it('rejects a bad signature', async () => {
    expect((await post({ event: 'subscription.activated' }, { sig: 'deadbeef' })).status).toBe(400);
  });
  it('activates, then cancels with access until the period end', async () => {
    const entity = sub({ current_end: s(Date.now() + 30 * DAY) });
    const a = await post({ event: 'subscription.activated', created_at: s(Date.now()), payload: { subscription: { entity } } }, { id: 'evt_a' });
    expect(a.json).toMatchObject({ ok: true, action: 'write' });
    expect(store.get('user_1').billing).toMatchObject({ plan: 'pro', status: 'active', subscriptionId: 'sub_A' });
    const dup = await post({ event: 'subscription.activated', created_at: s(Date.now()), payload: { subscription: { entity } } }, { id: 'evt_a' });
    expect(dup.json.action).toBe('ignore');
    await post({ event: 'subscription.cancelled', created_at: s(Date.now()) + 1, payload: { subscription: { entity: { ...entity, status: 'cancelled' } } } });
    const b = store.get('user_1').billing;
    expect(b).toMatchObject({ status: 'cancelled', cancelAtPeriodEnd: true });
    expect(currentPlanId(b)).toBe('pro');
  });
  it('ignores events it does not handle', async () => {
    expect((await post({ event: 'order.paid' })).json).toMatchObject({ ok: true, ignored: 'order.paid' });
  });
});
