import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { app } from '../../app.js';
import { db } from '../../db/index.js';
import { providers, providerCredentials, projects, apiKeys, hackathonKits, usageRecords, requests } from '../../db/schema/index.js';
import { clearPlanCache } from '../../auth/user.js';
import { clearEmailCache } from '../../auth/admin.js';
import { _resetCircuitsForTests } from '../../engine/circuit.js';

// Personal key pool + hackathon kits end-to-end: real DB (+ Redis when available),
// Clerk sessions signed with a test key, and a mock OpenAI-compatible upstream.
const run = Date.now().toString(36);
const FREE_USER = `user_free_${run}`;
const TEAM_USER = `user_team_${run}`; // on ADMIN_USER_IDS -> Team limits
let server: http.Server;
let upstream = '';
let privateKey: CryptoKey;
const saved: Record<string, string | undefined> = {};

async function session(sub: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: 'sess_test' }).setProtectedHeader({ alg: 'RS256', kid: 'ins_test' })
    .setSubject(sub).setIssuedAt(now - 5).setNotBefore(now - 5).setExpirationTime(now + 300).sign(privateKey);
}

async function as(sub: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method, headers: { Authorization: `Bearer ${await session(sub)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() as any };
}

let n = 0;
async function chat(key: string, model = 'mock-model') {
  const res = await app.request('/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: `pool ${run} ${n++}` }] }),
  });
  return { status: res.status, json: await res.json() as any, headers: res.headers };
}

/** Point the user's pooled OpenRouter provider at the mock upstream. */
async function useMockUpstream(userId: string) {
  await db.update(providers).set({ baseUrl: upstream }).where(eq(providers.ownerUserId, userId));
}

beforeAll(async () => {
  for (const k of ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'ADMIN_USER_IDS', 'ADMIN_EMAILS', 'ALLOWED_ORIGINS']) saved[k] = process.env[k];
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  process.env.CLERK_JWT_KEY = await exportSPKI(pair.publicKey);
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.ADMIN_EMAILS;
  delete process.env.ALLOWED_ORIGINS;
  process.env.ADMIN_USER_IDS = TEAM_USER;
  clearPlanCache(); clearEmailCache(); _resetCircuitsForTests?.();

  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const key = String(req.headers.authorization || '').replace('Bearer ', '');
      if (key.startsWith('rl-')) { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Rate limit reached' } })); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: JSON.parse(body || '{}').model, choices: [{ index: 0, message: { role: 'assistant', content: `from ${key.slice(-4)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  upstream = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
}, 30000);

afterAll(async () => {
  for (const uid of [FREE_USER, TEAM_USER]) {
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
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  server.close();
});

describe('personal key pool', () => {
  let poolKey = '';

  it('requires a Clerk session', async () => {
    const res = await app.request('/user/pool');
    expect(res.status).toBe(401);
  });

  it('Free plan: 2 pooled keys, the 3rd is refused with plan_limit_reached', async () => {
    expect((await as(FREE_USER, 'POST', '/user/pool/keys', { provider: 'openrouter', name: 'A', apiKey: 'rl-free-key-AAAA' })).status).toBe(201);
    expect((await as(FREE_USER, 'POST', '/user/pool/keys', { provider: 'openrouter', name: 'B', apiKey: 'ok-free-key-BBBB' })).status).toBe(201);
    const third = await as(FREE_USER, 'POST', '/user/pool/keys', { provider: 'groq', name: 'C', apiKey: 'ok-free-key-CCCC' });
    expect(third.status).toBe(403);
    expect(third.json.error.type).toBe('plan_limit_reached');
  });

  it('keys are stored encrypted and never returned in full', async () => {
    const pool = await as(FREE_USER, 'GET', '/user/pool');
    expect(pool.status).toBe(200);
    expect(pool.json.data.limit).toBe(2);
    expect(pool.json.data.keys.map((k: any) => k.key).sort()).toEqual(['rl…AAAA', 'ok…BBBB'].sort());
    const [row] = await db.select().from(providerCredentials).where(eq(providerCredentials.name, 'A'));
    expect(row.encryptedKey).not.toContain('rl-free');
  });

  it('a pool dvai_ key rotates over the pool and survives a rate-limited key', async () => {
    const created = await as(FREE_USER, 'POST', '/user/pool/api-keys', { name: 'laptop' });
    expect(created.status).toBe(201);
    poolKey = created.json.data.key;
    await useMockUpstream(FREE_USER);
    await as(FREE_USER, 'PUT', '/user/pool/strategy', { keyStrategy: 'failover' });
    const r = await chat(poolKey);
    expect(r.status).toBe(200);
    expect(r.json.choices[0].message.content).toBe('from BBBB');
    expect(r.json.devai.key_fallbacks).toBe(1);
    expect(r.headers.get('x-cache')).toBeNull(); // pool traffic never uses the shared cache
  });

  it('shows per-key health and the stretch stats', async () => {
    await new Promise(r => setTimeout(r, 300)); // usage rows are written asynchronously
    const pool = (await as(FREE_USER, 'GET', '/user/pool')).json.data;
    const a = pool.keys.find((k: any) => k.name === 'A');
    const b = pool.keys.find((k: any) => k.name === 'B');
    expect(a.health).toBe('cooling_down');
    expect(a.stats.rateLimited).toBeGreaterThanOrEqual(1);
    expect(b.health).toBe('healthy');
    expect(pool.stats.served).toBeGreaterThanOrEqual(1);
    expect(pool.stats.rateLimitsAbsorbed).toBeGreaterThanOrEqual(1);
  });

  it("other users' pools are invisible and shared routing never uses pooled keys", async () => {
    const other = (await as(TEAM_USER, 'GET', '/user/pool')).json.data;
    expect(other.keys).toEqual([]);
    const someKey = (await as(FREE_USER, 'GET', '/user/pool')).json.data.keys[0].id;
    expect((await as(TEAM_USER, 'DELETE', `/user/pool/keys/${someKey}`)).status).toBe(404);
  });
});

describe('hackathon kits', () => {
  let kit: any;

  it('needs the Team plan', async () => {
    const r = await as(FREE_USER, 'POST', '/user/kits', { name: 'x', expiresAt: new Date(Date.now() + 3600e3).toISOString(), requestCap: 2 });
    expect(r.status).toBe(403);
    expect(r.json.error.type).toBe('plan_required');
  });

  it('creates a kit with team keys, a request cap and allowed models', async () => {
    await as(TEAM_USER, 'POST', '/user/pool/keys', { provider: 'openrouter', name: 'T1', apiKey: 'ok-team-key-TTTT' });
    await useMockUpstream(TEAM_USER);
    const r = await as(TEAM_USER, 'POST', '/user/kits', {
      name: `Hack ${run}`, expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      requestCap: 2, maxTeamSize: 3, allowedModels: ['mock-model'],
    });
    expect(r.status).toBe(201);
    kit = r.json.data;
    expect(kit.keys).toHaveLength(3);
    expect(kit.keys[0].key).toMatch(/^dvai_/);
  });

  it('enforces the model list and the request cap with clear errors', async () => {
    const key = kit.keys[0].key;
    const bad = await chat(key, 'gpt-4o');
    expect(bad.status).toBe(400);
    expect(bad.json.error.type).toBe('kit_model_not_allowed');
    expect((await chat(key)).status).toBe(200);
    expect((await chat(kit.keys[1].key, 'auto')).status).toBe(200); // auto -> first allowed model
    const over = await chat(kit.keys[2].key);
    expect(over.status).toBe(429);
    expect(over.json.error.type).toBe('kit_request_cap_reached');
  });

  it('public share page shows remaining quota and expiry, without keys', async () => {
    const res = await app.request(`/public/kits/${kit.shareToken}`);
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.data.usage.requests).toBe(2);
    expect(body.data.usage.requestsRemaining).toBe(0);
    expect(body.data.status).toBe('active');
    expect(JSON.stringify(body)).not.toContain('dvai_');
  });

  it('owner can revoke; requests then fail with kit_revoked', async () => {
    expect((await as(FREE_USER, 'POST', `/user/kits/${kit.id}/revoke`)).status).toBe(404);
    const r = await as(TEAM_USER, 'POST', `/user/kits/${kit.id}/revoke`);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('revoked');
    const after = await chat(kit.keys[0].key);
    expect(after.status).toBe(403);
    expect(after.json.error.type).toBe('kit_revoked');
  });

  it('expired kits are refused', async () => {
    const r = await as(TEAM_USER, 'POST', '/user/kits', { name: `Exp ${run}`, expiresAt: new Date(Date.now() + 3600e3).toISOString(), tokenCap: 1000 });
    await db.update(hackathonKits).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(hackathonKits.id, r.json.data.id));
    const res = await chat(r.json.data.keys[0].key);
    expect(res.status).toBe(403);
    expect(res.json.error.type).toBe('kit_expired');
  });
});
