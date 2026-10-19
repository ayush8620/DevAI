import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../../app.js';
import { db } from '../../db/index.js';
import { providers, providerCredentials, projects, apiKeys, hackathonKits, usageRecords, requests, userAccounts, auditLogs } from '../../db/schema/index.js';
import { clearPlanCache } from '../../auth/user.js';
import { clearEmailCache } from '../../auth/admin.js';
import { clearSuspensionCache } from '../../services/accounts.js';
import { setUserDirectory, type DirectoryUser, type UserDirectory } from '../../services/user-directory.js';

// Admin panel end-to-end against a real PostgreSQL (run drizzle/0004_admin_panel.sql first).
// Clerk is replaced by an in-memory user directory; sessions are signed with a test key.
const run = Date.now().toString(36);
const ADMIN = `user_padmin_${run}`;
const ALICE = `user_alice_${run}`;   // free user with a BYOK key and traffic
const BOB = `user_bob_${run}`;       // Pro via Razorpay (renewing)
const CAROL = `user_carol_${run}`;   // comped Team, then suspended
const ALL = [ADMIN, ALICE, BOB, CAROL];
const SECRET = `sk-or-v1-${run}-abcdefghijklmnopqrstuvwxyz`;
let privateKey: CryptoKey;
const saved: Record<string, string | undefined> = {};
const future = new Date(Date.now() + 20 * 86_400_000).toISOString();

const users = new Map<string, DirectoryUser>();
const mk = (id: string, email: string, billing: unknown = null, createdAgoMin = 0): DirectoryUser => ({
  id, email, name: email.split('@')[0], imageUrl: null,
  createdAt: new Date(Date.now() - createdAgoMin * 60_000).toISOString(), lastActiveAt: null, lastSignInAt: null, billing,
});
const fakeDirectory: UserDirectory = {
  source: 'test',
  async list({ query, limit, offset }) {
    const all = [...users.values()].filter(u => !query || u.email!.includes(query) || u.id.includes(query))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { users: all.slice(offset, offset + limit), total: all.length };
  },
  async get(id) { return users.get(id) ?? null; },
  async all(max) { return [...users.values()].slice(0, max); },
  async byIds(ids) { return ids.map(id => users.get(id)).filter((u): u is DirectoryUser => Boolean(u)); },
  async setBilling(id, billing) { const u = users.get(id); if (u) users.set(id, { ...u, billing }); },
};

async function session(sub: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: 'sess_test' }).setProtectedHeader({ alg: 'RS256', kid: 'ins_test' })
    .setSubject(sub).setIssuedAt(now - 5).setNotBefore(now - 5).setExpirationTime(now + 300).sign(privateKey);
}
async function as(sub: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, { method, headers: { Authorization: `Bearer ${await session(sub)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() as any };
}
async function chat(key: string) {
  const res = await app.request('/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mock', messages: [{ role: 'user', content: `admin ${run}` }] }),
  });
  return { status: res.status, json: await res.json() as any };
}

let aliceKey = '';
let aliceCredId = '';

beforeAll(async () => {
  for (const k of ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'ADMIN_USER_IDS', 'ADMIN_EMAILS', 'ALLOWED_ORIGINS']) saved[k] = process.env[k];
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  process.env.CLERK_JWT_KEY = await exportSPKI(pair.publicKey);
  delete process.env.CLERK_SECRET_KEY; delete process.env.ADMIN_EMAILS; delete process.env.ALLOWED_ORIGINS;
  process.env.ADMIN_USER_IDS = ADMIN;
  clearPlanCache(); clearEmailCache(); clearSuspensionCache();

  users.set(ADMIN, mk(ADMIN, `admin-${run}@example.com`, null, 40));
  users.set(ALICE, mk(ALICE, `alice-${run}@example.com`, null, 30));
  users.set(BOB, mk(BOB, `bob-${run}@example.com`, { plan: 'pro', period: 'monthly', status: 'active', expiresAt: future, subscriptionId: `sub_${run}`, updatedAt: new Date().toISOString() }, 20));
  users.set(CAROL, mk(CAROL, `carol-${run}@example.com`, null, 10));
  setUserDirectory(fakeDirectory);

  // Alice: one BYOK key, one pool API key and some traffic (2 ok, 1 error)
  const added = await as(ALICE, 'POST', '/user/pool/keys', { provider: 'openrouter', apiKey: SECRET });
  expect(added.status, JSON.stringify(added.json)).toBe(201);
  aliceCredId = added.json.data.id;
  const k = await as(ALICE, 'POST', '/user/pool/api-keys', { name: 'admin test' });
  aliceKey = k.json.data.key;
  const [pool] = await db.select().from(projects).where(eq(projects.ownerUserId, ALICE));
  await db.insert(usageRecords).values([
    { projectId: pool.id, requestId: `req_a1_${run}`, model: 'openrouter/auto', totalTokens: 10, status: 200 },
    { projectId: pool.id, requestId: `req_a2_${run}`, model: 'openrouter/auto', totalTokens: 15, status: 200 },
    { projectId: pool.id, requestId: `req_a3_${run}`, model: 'openrouter/auto', totalTokens: 0, status: 429, error: 'rate limited' },
  ]);
}, 30000);

afterAll(async () => {
  setUserDirectory(null);
  for (const uid of ALL) {
    const projs = await db.select().from(projects).where(eq(projects.ownerUserId, uid));
    for (const p of projs) {
      await db.delete(hackathonKits).where(eq(hackathonKits.projectId, p.id));
      await db.delete(usageRecords).where(eq(usageRecords.projectId, p.id));
      await db.delete(requests).where(eq(requests.projectId, p.id));
      await db.delete(apiKeys).where(eq(apiKeys.projectId, p.id));
      await db.delete(projects).where(eq(projects.id, p.id));
    }
    const provs = await db.select().from(providers).where(eq(providers.ownerUserId, uid));
    for (const p of provs) {
      await db.delete(providerCredentials).where(eq(providerCredentials.providerId, p.id));
      await db.delete(providers).where(eq(providers.id, p.id));
    }
  }
  await db.delete(userAccounts).where(inArray(userAccounts.userId, ALL));
  await db.delete(auditLogs).where(inArray(auditLogs.resourceId, ALL));
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  clearSuspensionCache();
});

describe('admin panel access', () => {
  it('non-admins get 403 on every admin endpoint; admins get data', async () => {
    for (const path of ['/admin/overview', '/admin/users', '/admin/subscriptions', '/admin/pool', '/admin/system', '/admin/audit-logs', '/admin/analytics/by-day']) {
      expect((await as(ALICE, 'GET', path)).status, path).toBe(403);
    }
    expect((await as(ADMIN, 'GET', '/admin/me')).json.data.method).toBe('clerk');
  });

  it('/user/me tells the dashboard whether to show the Admin link', async () => {
    expect((await as(ADMIN, 'GET', '/user/me')).json.data.isAdmin).toBe(true);
    const me = await as(ALICE, 'GET', '/user/me');
    expect(me.status).toBe(200);
    expect(me.json.data).toMatchObject({ userId: ALICE, plan: 'free', isAdmin: false });
  });
});

describe('overview and subscriptions', () => {
  it('counts users, paid plans and an MRR estimate from renewing subscriptions only', async () => {
    const r = await as(ADMIN, 'GET', '/admin/overview');
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const d = r.json.data;
    expect(d.users.total).toBe(4);
    expect(d.users.recent[0].id).toBe(CAROL); // newest first
    expect(d.subscriptions.byPlan.pro).toBe(1);
    expect(d.mrrEstimatePaise).toBe(49_900);
    expect(d.usage.days).toHaveLength(7);
    expect(d.usage.today.requests).toBeGreaterThanOrEqual(3);
    expect(d.usage.today.errors).toBeGreaterThanOrEqual(1);
  });

  it('lists subscriptions with plan and status filters', async () => {
    const all = await as(ADMIN, 'GET', '/admin/subscriptions');
    expect(all.json.data.map((s: any) => s.userId)).toEqual([BOB]);
    expect(all.json.data[0]).toMatchObject({ plan: 'pro', status: 'active', source: 'razorpay', renews: true });
    expect((await as(ADMIN, 'GET', '/admin/subscriptions?plan=team')).json.data).toHaveLength(0);
    expect((await as(ADMIN, 'GET', '/admin/subscriptions?status=active&plan=pro')).json.total).toBe(1);
  });
});

describe('users', () => {
  it('search + list show plan, status, requests and BYOK key count', async () => {
    const r = await as(ADMIN, 'GET', `/admin/users?q=alice-${run}`);
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(1);
    expect(r.json.data[0]).toMatchObject({ id: ALICE, plan: 'free', status: 'active', requests30d: 3, byokKeys: 1, isAdmin: false });
    expect(r.json.data[0].lastActiveAt).toBeTruthy();
    const page = await as(ADMIN, 'GET', '/admin/users?limit=2&page=2');
    expect(page.json.data).toHaveLength(2);
    expect(page.json.total).toBe(4);
  });

  it('detail shows projects, masked keys and usage, never a full secret', async () => {
    const r = await as(ADMIN, 'GET', `/admin/users/${ALICE}`);
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.projects[0].kind).toBe('pool');
    expect(d.projects[0].apiKeys[0].key).toMatch(/^dvai_.*…$/);
    expect(d.byokKeys[0].key).toBe(`${SECRET.slice(0, 4)}…${SECRET.slice(-4)}`);
    expect(JSON.stringify(r.json)).not.toContain(SECRET);
    expect(JSON.stringify(r.json)).not.toContain(aliceKey);
    expect(d.usage.last30).toMatchObject({ requests: 3, tokens: 25, errors: 1 });
    expect(d.usage.days).toHaveLength(30);
    expect((await as(ADMIN, 'GET', `/admin/users/user_nobody_${run}`)).status).toBe(404);
  });

  it('comp plan: writes a non-renewing billing record, refuses to overwrite a renewing subscription without force, audits', async () => {
    const bad = await as(ADMIN, 'POST', `/admin/users/${CAROL}/plan`, { plan: 'gold' });
    expect(bad.status).toBe(400);
    const r = await as(ADMIN, 'POST', `/admin/users/${CAROL}/plan`, { plan: 'team', period: 'monthly', days: 14, note: 'hackathon sponsor' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.plan).toBe('team');
    expect((users.get(CAROL)!.billing as any)).toMatchObject({ plan: 'team', source: 'comp', cancelAtPeriodEnd: true });
    expect((users.get(CAROL)!.billing as any).subscriptionId).toBeUndefined();
    // The gateway applies it right away (plan cache cleared)
    expect((await as(CAROL, 'GET', '/user/me')).json.data.plan).toBe('team');

    const blocked = await as(ADMIN, 'POST', `/admin/users/${BOB}/plan`, { plan: 'free' });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.type).toBe('has_subscription');

    const logs = await as(ADMIN, 'GET', `/admin/audit-logs?action=user.plan_changed&resourceId=${CAROL}`);
    expect(logs.json.data[0]).toMatchObject({ action: 'user.plan_changed', actor: `clerk:${ADMIN}`, resourceId: CAROL });
    expect(logs.json.data[0].details.to).toBe('team');
  });

  it('suspend: /user/* and the user\'s pool keys get 403; unsuspend restores access; admins cannot be suspended', async () => {
    expect((await as(ADMIN, 'POST', `/admin/users/${ADMIN}/suspend`, { reason: 'oops' })).status).toBe(400);

    const s = await as(ADMIN, 'POST', `/admin/users/${ALICE}/suspend`, { reason: 'abuse test' });
    expect(s.status, JSON.stringify(s.json)).toBe(200);
    expect(s.json.data).toMatchObject({ status: 'suspended', suspendedReason: 'abuse test' });

    const me = await as(ALICE, 'GET', '/user/pool');
    expect(me.status).toBe(403);
    expect(me.json.error.type).toBe('account_suspended');
    const v1 = await chat(aliceKey);
    expect(v1.status).toBe(403);
    expect(v1.json.error.type).toBe('account_suspended');
    expect((await as(ADMIN, 'GET', `/admin/users?q=alice-${run}`)).json.data[0].status).toBe('suspended');

    expect((await as(ADMIN, 'POST', `/admin/users/${ALICE}/unsuspend`)).status).toBe(200);
    expect((await as(ALICE, 'GET', '/user/me')).status).toBe(200);
    expect((await chat(aliceKey)).json.error?.type).not.toBe('account_suspended');

    const logs = await as(ADMIN, 'GET', `/admin/audit-logs?action=user.&resourceId=${ALICE}`);
    expect(logs.json.data.map((l: any) => l.action)).toEqual(['user.unsuspended', 'user.suspended']);
  });
});

describe('key pool, kits, usage, audit and system', () => {
  it('pool page counts keys; revoking an abusive key sticks (the user cannot re-enable it)', async () => {
    const p = await as(ADMIN, 'GET', '/admin/pool');
    expect(p.status).toBe(200);
    expect(p.json.data.counts.providerKeys.total).toBeGreaterThanOrEqual(1);
    const row = p.json.data.providerKeys.find((k: any) => k.id === aliceCredId);
    expect(row).toMatchObject({ ownerUserId: ALICE, ownerEmail: `alice-${run}@example.com`, enabled: true });
    expect(row.key).not.toContain(SECRET);

    expect((await as(ADMIN, 'POST', `/admin/pool/keys/${aliceCredId}/revoke`, { reason: 'leaked' })).status).toBe(200);
    const enable = await as(ALICE, 'PATCH', `/user/pool/keys/${aliceCredId}`, { enabled: true });
    expect(enable.status).toBe(403);
    expect(enable.json.error.type).toBe('key_revoked');
    const pool = await as(ALICE, 'GET', '/user/pool');
    expect(pool.json.data.keys[0].health).toBe('disabled');
  });

  it('revokes a kit and a pool API key', async () => {
    const [proj] = await db.insert(projects).values({ name: `Kit: t ${run}`, kind: 'kit', ownerUserId: CAROL }).returning();
    const [kit] = await db.insert(hackathonKits).values({ ownerUserId: CAROL, projectId: proj.id, name: `kit ${run}`, shareToken: `share_${run}`, requestCap: 10, expiresAt: new Date(Date.now() + 86_400_000) }).returning();
    const r = await as(ADMIN, 'POST', `/admin/pool/kits/${kit.id}/revoke`, { reason: 'abuse' });
    expect(r.json.data.status).toBe('revoked');
    const [poolKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, aliceKey.slice(0, 12)));
    expect((await as(ADMIN, 'POST', `/admin/pool/api-keys/${poolKey.id}/revoke`)).status).toBe(200);
    expect((await chat(aliceKey)).status).toBe(401);
    expect((await as(ADMIN, 'POST', `/admin/pool/kits/00000000-0000-0000-0000-000000000000/revoke`)).status).toBe(404);
  });

  it('usage endpoints: per day, by provider name, top users', async () => {
    const days = await as(ADMIN, 'GET', '/admin/analytics/by-day?days=14');
    expect(days.json.data).toHaveLength(14);
    expect(days.json.data[13].requests).toBeGreaterThanOrEqual(3);
    const top = await as(ADMIN, 'GET', '/admin/analytics/top-users?period=today&limit=50');
    // 3 seeded rows + the request made after unsuspending
    const alice = top.json.data.find((u: any) => u.userId === ALICE);
    expect(alice.email).toBe(`alice-${run}@example.com`);
    expect(alice.requests).toBeGreaterThanOrEqual(3);
    const prov = await as(ADMIN, 'GET', '/admin/analytics/by-provider?period=today');
    expect(Array.isArray(prov.json.data)).toBe(true);
  });

  it('/user/usage only shows the caller\'s own traffic', async () => {
    const a = await as(ALICE, 'GET', '/user/usage?period=week');
    expect(a.status).toBe(200);
    expect(a.json.data.summary.requests).toBeGreaterThanOrEqual(3);
    expect(a.json.data.recent.every((r: any) => typeof r.requestId === 'string')).toBe(true);
    const c = await as(CAROL, 'GET', '/user/usage');
    expect(c.json.data.summary.requests).toBe(0);
  });

  it('audit log filters by actor text and returns facets', async () => {
    const r = await as(ADMIN, 'GET', `/admin/audit-logs?actor=${ADMIN}&limit=2`);
    expect(r.json.data.length).toBe(2);
    expect(r.json.hasMore).toBe(true);
    const f = await as(ADMIN, 'GET', '/admin/audit-logs/facets');
    expect(f.json.data.actions).toContain('user.suspended');
  });

  it('system shows health, build info and that 0004 is applied', async () => {
    const r = await as(ADMIN, 'GET', '/admin/system');
    expect(r.status).toBe(200);
    expect(r.json.data.health.database).toBe('healthy');
    expect(r.json.data.migrations.find((m: any) => m.name === '0004_admin_panel').applied).toBe(true);
    expect(r.json.data.build.node).toBe(process.version);
  });
});
