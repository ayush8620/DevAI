import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { and, eq } from 'drizzle-orm';
import { app } from '../../app.js';
import { db } from '../../db/index.js';
import { providers, providerCredentials, projects, apiKeys, usageRecords, requests, healthChecks } from '../../db/schema/index.js';
import { encrypt } from '../../crypto/encryption.js';
import { clearPlanCache } from '../../auth/user.js';
import { clearEmailCache } from '../../auth/admin.js';

// Bring-your-own-key end to end: real DB (+ Redis when available), Clerk sessions signed
// with a test key, and a mock OpenAI-compatible upstream that records which key it saw.
const run = Date.now().toString(36);
const NO_KEYS_USER = `user_nokeys_${run}`;
const USER_A = `user_a_${run}`;
const USER_B = `user_b_${run}`;
let server: http.Server;
let upstream = '';
let privateKey: CryptoKey;
let sharedProviderId = '';
const seenKeys: string[] = [];
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
async function chat(key: string, model = 'auto') {
  const res = await app.request('/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: `byok ${run} ${n++}` }] }),
  });
  return { status: res.status, json: await res.json() as any, headers: res.headers };
}

async function apiKeyFor(sub: string) {
  const r = await as(sub, 'POST', '/user/pool/api-keys', { name: 'test' });
  expect(r.status).toBe(201);
  return r.json.data.key as string;
}

beforeAll(async () => {
  for (const k of ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'ADMIN_USER_IDS', 'ADMIN_EMAILS', 'ALLOWED_ORIGINS']) saved[k] = process.env[k];
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  process.env.CLERK_JWT_KEY = await exportSPKI(pair.publicKey);
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.ADMIN_EMAILS;
  delete process.env.ALLOWED_ORIGINS;
  process.env.ADMIN_USER_IDS = `${USER_A},${USER_B}`; // Team limits so a user can add several keys
  clearPlanCache(); clearEmailCache();

  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const key = String(req.headers.authorization || '').replace('Bearer ', '');
      seenKeys.push(key);
      if (key.startsWith('bad-')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'invalid key' } })); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: JSON.parse(body || '{}').model ?? 'm', data: [], choices: [{ index: 0, message: { role: 'assistant', content: `from ${key.slice(-4)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  upstream = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  // An admin-managed (shared) provider with a key, which would happily serve gpt-4o-mini.
  // BYOK means it must never answer a user's request.
  const [p] = await db.insert(providers).values({ type: 'openai', name: `shared-${run}`, baseUrl: upstream, status: 'active' }).returning();
  sharedProviderId = p.id;
  const enc = encrypt('shared-admin-key-SHRD');
  await db.insert(providerCredentials).values({ providerId: p.id, name: 'admin', encryptedKey: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, enabled: true, status: 'active' });
}, 30000);

afterAll(async () => {
  for (const uid of [NO_KEYS_USER, USER_A, USER_B]) {
    const projs = await db.select().from(projects).where(eq(projects.ownerUserId, uid));
    for (const p of projs) {
      await db.delete(usageRecords).where(eq(usageRecords.projectId, p.id));
      await db.delete(requests).where(eq(requests.projectId, p.id));
      await db.delete(apiKeys).where(eq(apiKeys.projectId, p.id));
      await db.delete(projects).where(eq(projects.id, p.id));
    }
    const provs = await db.select().from(providers).where(eq(providers.ownerUserId, uid));
    for (const p of provs) {
      await db.delete(healthChecks).where(eq(healthChecks.providerId, p.id));
      await db.delete(usageRecords).where(eq(usageRecords.providerId, p.id));
      await db.delete(providerCredentials).where(eq(providerCredentials.providerId, p.id));
      await db.delete(providers).where(eq(providers.id, p.id));
    }
  }
  await db.delete(providerCredentials).where(eq(providerCredentials.providerId, sharedProviderId));
  await db.delete(providers).where(eq(providers.id, sharedProviderId));
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  server.close();
});

describe('bring your own key', () => {
  it('a user with no provider keys is told to add one (onboarding step add_provider_key)', async () => {
    const pool = await as(NO_KEYS_USER, 'GET', '/user/pool');
    expect(pool.status).toBe(200);
    expect(pool.json.data.keys).toEqual([]);
    expect(pool.json.data.onboarding).toEqual({ hasProviderKey: false, hasApiKey: false, nextStep: 'add_provider_key' });
    expect(pool.json.data.providers.map((p: any) => p.id)).toEqual(['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'mistral']);
  });

  it('no keys → 400 no_provider_keys; the shared admin keys are never used', async () => {
    const key = await apiKeyFor(NO_KEYS_USER);
    const before = seenKeys.length;
    for (const model of ['auto', 'gpt-4o-mini']) {
      const r = await chat(key, model);
      expect(r.status).toBe(400);
      expect(r.json.error.type).toBe('no_provider_keys');
      expect(r.json.error.message).toMatch(/^no_provider_keys: add your own provider key in the dashboard/);
    }
    const stream = await app.request('/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(stream.status).toBe(400);
    expect(((await stream.json()) as any).error.type).toBe('no_provider_keys');
    expect(seenKeys.slice(before)).toEqual([]);
    const models = await app.request('/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    expect(((await models.json()) as any).data).toEqual([]);
  });

  it('a user with a key is routed only over their own key', async () => {
    expect((await as(USER_A, 'POST', '/user/pool/keys', { provider: 'openrouter', name: 'A1', apiKey: 'user-a-key-AAAA' })).status).toBe(201);
    expect((await as(USER_B, 'POST', '/user/pool/keys', { provider: 'openrouter', name: 'B1', apiKey: 'user-b-key-BBBB' })).status).toBe(201);
    await db.update(providers).set({ baseUrl: upstream }).where(eq(providers.ownerUserId, USER_A));
    await db.update(providers).set({ baseUrl: upstream }).where(eq(providers.ownerUserId, USER_B));
    const pool = await as(USER_A, 'GET', '/user/pool');
    expect(pool.json.data.onboarding.nextStep).toBe('create_api_key');
    const keyA = await apiKeyFor(USER_A);
    expect((await as(USER_A, 'GET', '/user/pool')).json.data.onboarding.nextStep).toBe('done');

    const before = seenKeys.length;
    for (let i = 0; i < 3; i++) {
      const r = await chat(keyA, i === 0 ? 'auto' : 'gpt-4o-mini');
      expect(r.status).toBe(200);
      expect(r.json.choices[0].message.content).toBe('from AAAA');
    }
    expect(seenKeys.slice(before)).toEqual(['user-a-key-AAAA', 'user-a-key-AAAA', 'user-a-key-AAAA']);
    const models = await app.request('/v1/models', { headers: { Authorization: `Bearer ${keyA}` } });
    expect(((await models.json()) as any).data.map((m: any) => m.id)).toEqual(['openrouter/auto']);
  });

  it('a model none of the user keys serves → 400 no_provider_for_model', async () => {
    expect((await as(USER_B, 'POST', '/user/pool/keys', { provider: 'groq', name: 'B2', apiKey: 'user-b-groq-GGGG' })).status).toBe(201);
    // Only the groq key: drop B's OpenRouter (any-model) provider from routing for this check
    await db.update(providers).set({ status: 'inactive' }).where(and(eq(providers.ownerUserId, USER_B), eq(providers.name, 'OpenRouter')));
    try {
      const keyB = await apiKeyFor(USER_B);
      const r = await chat(keyB, 'claude-3-5-sonnet');
      expect(r.status).toBe(400);
      expect(r.json.error.type).toBe('no_provider_for_model');
    } finally {
      await db.update(providers).set({ status: 'active' }).where(and(eq(providers.ownerUserId, USER_B), eq(providers.name, 'OpenRouter')));
    }
  });

  it('per-user key health: Test a key and check all keys', async () => {
    const pool = (await as(USER_A, 'GET', '/user/pool')).json.data;
    const id = pool.keys[0].id;
    const one = await as(USER_A, 'POST', `/user/pool/keys/${id}/test`);
    expect(one.status).toBe(200);
    expect(one.json.data).toMatchObject({ credentialId: id, status: 'healthy', providerName: 'OpenRouter' });
    expect(seenKeys.at(-1)).toBe('user-a-key-AAAA');

    expect((await as(USER_A, 'POST', '/user/pool/keys', { provider: 'openrouter', name: 'A2', apiKey: 'bad-user-a-key-XXXX' })).status).toBe(201);
    const all = await as(USER_A, 'POST', '/user/pool/health');
    expect(all.json.data).toMatchObject({ status: 'degraded', healthy: 1, total: 2 });
    expect((await as(USER_A, 'GET', '/user/pool')).json.data.keys.find((k: any) => k.name === 'A2').lastCheck).toBe('unhealthy');
    // Another user cannot test A's key
    expect((await as(USER_B, 'POST', `/user/pool/keys/${id}/test`)).status).toBe(404);
    expect((await as(NO_KEYS_USER, 'POST', '/user/pool/health')).json.data.status).toBe('no_keys');
  });

  it('public /v1/health needs no provider and does not call one', async () => {
    const before = seenKeys.length;
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ gateway: 'healthy', database: 'healthy', byok: true });
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(seenKeys.length).toBe(before);
  });
});
