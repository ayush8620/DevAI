import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { eq, inArray, sql } from 'drizzle-orm';
import { app } from '../../app.js';
import { db } from '../../db/index.js';
import { coupons, couponRedemptions } from '../../db/schema/index.js';
import { clearPlanCache } from '../../auth/user.js';
import { clearEmailCache } from '../../auth/admin.js';
import { reserveRedemption, releaseRedemption, confirmRedemption, CouponLimitError } from '../../services/coupons.js';

// Promo codes end-to-end against a real PostgreSQL (run drizzle/0003_coupons.sql first).
const run = Date.now().toString(36).toUpperCase();
const ADMIN = `user_admin_${run}`;
const users = Array.from({ length: 8 }, (_, i) => `user_c${i}_${run}`);
let privateKey: CryptoKey;
const saved: Record<string, string | undefined> = {};
const created: string[] = [];

async function session(sub: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: 'sess_test' }).setProtectedHeader({ alg: 'RS256', kid: 'ins_test' })
    .setSubject(sub).setIssuedAt(now - 5).setNotBefore(now - 5).setExpirationTime(now + 300).sign(privateKey);
}
async function as(sub: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, { method, headers: { Authorization: `Bearer ${await session(sub)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() as any };
}
async function make(body: Record<string, unknown>) {
  const r = await as(ADMIN, 'POST', '/admin/coupons', body);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  created.push(r.json.data.id);
  return r.json.data;
}
const count = async (id: string) => (await db.select().from(coupons).where(eq(coupons.id, id)))[0].redemptionCount;

beforeAll(async () => {
  for (const k of ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'ADMIN_USER_IDS', 'ADMIN_EMAILS', 'ALLOWED_ORIGINS']) saved[k] = process.env[k];
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  process.env.CLERK_JWT_KEY = await exportSPKI(pair.publicKey);
  delete process.env.CLERK_SECRET_KEY; delete process.env.ADMIN_EMAILS; delete process.env.ALLOWED_ORIGINS;
  process.env.ADMIN_USER_IDS = ADMIN;
  clearPlanCache(); clearEmailCache();
}, 30000);

afterAll(async () => {
  if (created.length) {
    await db.delete(couponRedemptions).where(inArray(couponRedemptions.couponId, created));
    await db.delete(coupons).where(inArray(coupons.id, created));
  }
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe('admin coupon API', () => {
  it('only admins can create and list codes', async () => {
    expect((await as(users[0], 'POST', '/admin/coupons', { code: `X${run}`, kind: 'percent', percentOff: 10 })).status).toBe(403);
    const c = await make({ code: `adm${run}`, kind: 'percent', percentOff: 15, plans: ['pro'], note: 'test' });
    expect(c.code).toBe(`ADM${run}`);
    const dup = await as(ADMIN, 'POST', '/admin/coupons', { code: `ADM${run}`, kind: 'percent', percentOff: 15 });
    expect(dup.status).toBe(409);
    const list = await as(ADMIN, 'GET', '/admin/coupons');
    expect(list.json.data.some((x: any) => x.id === c.id && x.confirmedCount === 0)).toBe(true);
  });
  it('disabling a code stops validation', async () => {
    const c = await make({ code: `DIS${run}`, kind: 'flat', amountOffInr: 50, plans: ['pro'] });
    expect((await as(users[0], 'POST', '/user/coupons/validate', { code: c.code, plan: 'pro', period: 'monthly' })).json.data.finalPaise).toBe(44_900);
    expect((await as(ADMIN, 'PATCH', `/admin/coupons/${c.id}`, { status: 'disabled' })).status).toBe(200);
    const v = await as(users[0], 'POST', '/user/coupons/validate', { code: c.code, plan: 'pro', period: 'monthly' });
    expect(v.status).toBe(400);
    expect(v.json.error.type).toBe('disabled');
  });
});

describe('redemption limits', () => {
  it('never exceeds max_redemptions under concurrent checkouts', async () => {
    const c = await make({ code: `MAX${run}`, kind: 'percent', percentOff: 20, maxRedemptions: 3 });
    const results = await Promise.allSettled(users.map(u => reserveRedemption({ couponId: c.id, userId: u, plan: 'pro', period: 'monthly', discountPaise: 9_980 })));
    const won = results.filter(r => r.status === 'fulfilled');
    expect(won.length).toBe(3);
    expect(results.filter(r => r.status === 'rejected').every(r => (r as PromiseRejectedResult).reason instanceof CouponLimitError)).toBe(true);
    expect(await count(c.id)).toBe(3);
  });

  it('once per user: a second live redemption by the same user is refused, other users are fine', async () => {
    const c = await make({ code: `ONCE${run}`, kind: 'percent', percentOff: 10 });
    const r1 = await as(users[0], 'POST', '/user/coupons/reserve', { code: c.code, plan: 'pro', period: 'yearly' });
    expect(r1.status).toBe(200);
    expect(r1.json.data.finalPaise).toBe(449_100);
    expect((await as(users[0], 'POST', `/user/coupons/redemptions/${r1.json.data.redemptionId}/confirm`, { subscriptionId: 'sub_test1' })).status).toBe(200);
    const again = await as(users[0], 'POST', '/user/coupons/reserve', { code: c.code, plan: 'pro', period: 'yearly' });
    expect(again.status).toBe(400);
    expect(again.json.error.type).toBe('already_used');
    expect((await as(users[1], 'POST', '/user/coupons/reserve', { code: c.code, plan: 'team', period: 'monthly' })).status).toBe(200);
    expect(await count(c.id)).toBe(2);
  });

  it('a user re-opening checkout replaces their own hold instead of using two', async () => {
    const c = await make({ code: `RE${run}`, kind: 'percent', percentOff: 10, maxRedemptions: 1 });
    const a = await reserveRedemption({ couponId: c.id, userId: users[2], plan: 'pro', period: 'monthly', discountPaise: 4_990 });
    const b = await reserveRedemption({ couponId: c.id, userId: users[2], plan: 'pro', period: 'monthly', discountPaise: 4_990 });
    expect(a).not.toBe(b);
    expect(await count(c.id)).toBe(1);
    await expect(reserveRedemption({ couponId: c.id, userId: users[3], plan: 'pro', period: 'monthly', discountPaise: 4_990 })).rejects.toBeInstanceOf(CouponLimitError);
  });

  it('released and expired holds give the use back; a late confirm counts it again', async () => {
    const c = await make({ code: `REL${run}`, kind: 'percent', percentOff: 10, maxRedemptions: 1, oncePerUser: false });
    const id = await reserveRedemption({ couponId: c.id, userId: users[4], plan: 'pro', period: 'monthly', discountPaise: 4_990 });
    expect(await releaseRedemption(id, users[5])).toBe(false); // not theirs
    expect(await releaseRedemption(id, users[4])).toBe(true);
    expect(await count(c.id)).toBe(0);
    const id2 = await reserveRedemption({ couponId: c.id, userId: users[5], plan: 'pro', period: 'monthly', discountPaise: 4_990 });
    // Simulate an abandoned checkout whose hold ran out
    await db.execute(sql`UPDATE coupon_redemptions SET reserved_until = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = ${id2}`);
    const v = await as(users[6], 'POST', '/user/coupons/validate', { code: c.code, plan: 'pro', period: 'monthly' });
    expect(v.status).toBe(200); // the stale hold was released
    const id3 = await reserveRedemption({ couponId: c.id, userId: users[6], plan: 'pro', period: 'monthly', discountPaise: 4_990 });
    expect(await count(c.id)).toBe(1);
    // The abandoned one was actually paid after all (late webhook): confirmed and counted.
    expect(await confirmRedemption(id2, 'sub_late', null)).toBe(true);
    expect(await count(c.id)).toBe(2);
    expect(await confirmRedemption(id3, 'sub_ok', users[6])).toBe(true);
    expect(await confirmRedemption(id3, 'sub_ok', users[6])).toBe(true); // idempotent
    expect(await count(c.id)).toBe(2);
  });

  it('expired codes cannot be reserved', async () => {
    const c = await make({ code: `EXP${run}`, kind: 'percent', percentOff: 10, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await db.update(coupons).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(coupons.id, c.id));
    await expect(reserveRedemption({ couponId: c.id, userId: users[7], plan: 'pro', period: 'monthly', discountPaise: 1 })).rejects.toBeInstanceOf(CouponLimitError);
  });
});
