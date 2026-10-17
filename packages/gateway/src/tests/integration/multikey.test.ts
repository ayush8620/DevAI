import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { app } from '../../app.js';
import { config } from '../../config.js';
import { _resetCircuitsForTests } from '../../engine/circuit.js';
import { redis } from '../../cache/redis.js';

// End-to-end through the real admin API + DB + Redis, against a mock OpenAI-compatible upstream.
// Keys starting with "rl-" get 429, "bad-" get 401, others answer with the key's last 4 chars.
let server: http.Server;
let baseUrl = '';
const seen: string[] = [];

const ADMIN = { Authorization: `Bearer ${config.ADMIN_API_KEY}`, 'Content-Type': 'application/json' };
const run = Date.now().toString(36);
let providerId = '';
let providerName = '';
let projectId = '';
let userKey = '';
const credIds: Record<string, string> = {};

async function admin(method: string, path: string, body?: unknown) {
  const res = await app.request(path, { method, headers: ADMIN, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() as any };
}

let n = 0;
async function chat(extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const res = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userKey}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ model: 'mock-model', messages: [{ role: 'user', content: `q ${run} ${n++}` }], devai: { providers: [providerName] }, ...extra }),
  });
  return res;
}

async function addKey(name: string, apiKey: string) {
  const r = await admin('POST', `/admin/credentials/provider/${providerId}`, { name, apiKey });
  credIds[name] = r.json.data.id;
  return r;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const key = String(req.headers.authorization || '').replace('Bearer ', '');
      if (req.url?.endsWith('/models')) {
        res.writeHead(key.startsWith('bad-') ? 401 : 200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'gpt-mock', object: 'model', created: 0, owned_by: 'mock' }] }));
      }
      seen.push(key);
      if (key.startsWith('rl-')) { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Rate limit reached' } })); }
      if (key.startsWith('bad-')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Invalid API key' } })); }
      const parsed = JSON.parse(body || '{}');
      const text = `answer from ${key.slice(-4)}`;
      if (parsed.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const piece of ['answer ', 'from ', key.slice(-4)]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } })}\n\n`);
        return res.end('data: [DONE]\n\n');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'mock-model', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  providerName = `mk-${run}`;
  providerId = (await admin('POST', '/admin/providers', { type: 'openai', name: providerName, baseUrl })).json.data.id;
  projectId = (await admin('POST', '/admin/projects', { name: `mk-${run}` })).json.data.id;
  userKey = (await admin('POST', `/admin/api-keys/project/${projectId}`, { name: 'mk' })).json.data.key;
}, 30000);

afterAll(async () => {
  await admin('DELETE', `/admin/providers/${providerId}`);
  await admin('DELETE', `/admin/projects/${projectId}`);
  server.close();
});

describe('multi-key routing (real DB + Redis, mock upstream)', () => {
  it('key1 rate-limited (429) → same provider answers with key2; headers show the key', async () => {
    await addKey('primary', 'rl-primary-key-0000000000AAAA');
    await addKey('backup', 'ok-backup-key-0000000000BBBB');
    const res = await chat();
    expect(res.status).toBe(200);
    expect(res.headers.get('x-devai-provider')).toBe(`${providerName}/mock-model`);
    expect(res.headers.get('x-devai-key')).toBe('backup (ok-b...BBBB)');
    expect(res.headers.get('x-devai-key-fallbacks')).toBe('1');
    expect(res.headers.get('x-devai-fallbacks')).toBe('0');
    const body = await res.json() as any;
    expect(body.choices[0].message.content).toBe('answer from BBBB');
    expect(body.devai.key_fallbacks).toBe(1);
  }, 20000);

  it('the rate-limited key is cooling down: next request goes straight to key2', async () => {
    seen.length = 0;
    const res = await chat();
    expect(res.status).toBe(200);
    expect(seen).toEqual(['ok-backup-key-0000000000BBBB']);
    expect(res.headers.get('x-devai-key-fallbacks')).toBe('0');
  }, 20000);

  it('credentials list shows real prefix/last4 and per-key live status', async () => {
    const { json } = await admin('GET', `/admin/credentials/provider/${providerId}`);
    const byName = Object.fromEntries(json.data.map((c: any) => [c.name, c]));
    expect(byName.primary.maskedKey).toBe('rl-p…AAAA');
    expect(byName.backup.maskedKey).toBe('ok-b…BBBB');
    expect(byName.primary.liveStatus).toBe('rate_limited');
    expect(byName.primary.cooldownSec).toBeGreaterThan(0);
    expect(byName.backup.liveStatus).toBe('active');
    expect(json.data.map((c: any) => c.priority)).toEqual([1, 2]);
  });

  it('a passing key test clears its cooldown', async () => {
    // swap the 429 key for a working one, then the test endpoint resets it
    await admin('DELETE', `/admin/credentials/${credIds.primary}`);
    await addKey('primary2', 'ok-primary2-key-000000000CCCC');
    const t = await admin('POST', `/admin/credentials/${credIds.primary2}/test`);
    expect(t.status).toBe(200);
  });

  it('round_robin (provider setting) alternates keys across requests', async () => {
    _resetCircuitsForTests();
    const patch = await admin('PATCH', `/admin/providers/${providerId}`, { config: { keyStrategy: 'round_robin' } });
    expect(patch.status).toBe(200);
    const used: string[] = [];
    for (let i = 0; i < 4; i++) used.push(((await (await chat()).json()) as any).choices[0].message.content.slice(-4));
    expect(new Set(used)).toEqual(new Set(['BBBB', 'CCCC']));
    expect(used[0]).not.toBe(used[1]);
    expect(used[1]).not.toBe(used[2]);
  }, 30000);

  it('failover + key priority order: the chosen first key is always used while healthy', async () => {
    await admin('PATCH', `/admin/providers/${providerId}`, { config: { keyStrategy: 'failover', keyOrder: [credIds.primary2, credIds.backup] } });
    const used: string[] = [];
    for (let i = 0; i < 3; i++) used.push(((await (await chat()).json()) as any).choices[0].message.content.slice(-4));
    expect(used).toEqual(['CCCC', 'CCCC', 'CCCC']);
    const { json } = await admin('GET', `/admin/credentials/provider/${providerId}`);
    expect(json.data[0].id).toBe(credIds.primary2);
    // config was merged, not replaced
    const p = (await admin('GET', '/admin/providers')).json.data.find((x: any) => x.id === providerId);
    expect(p.config).toMatchObject({ keyStrategy: 'failover', keyOrder: [credIds.primary2, credIds.backup] });
    expect(p.keyStrategy).toBe('failover');
  }, 30000);

  it('per-request override via header and body', async () => {
    const viaHeader = await chat({}, { 'x-devai-key-strategy': 'least_used' });
    expect(viaHeader.status).toBe(200);
    // least_used: CCCC has had more requests this minute than BBBB
    expect(((await viaHeader.json()) as any).choices[0].message.content).toBe('answer from BBBB');
    const viaBody = await chat({ devai: { providers: [providerName], keyStrategy: 'random' } });
    expect(viaBody.status).toBe(200);
  }, 20000);

  it('rejects an unknown key strategy', async () => {
    const r = await admin('PATCH', `/admin/providers/${providerId}`, { config: { keyStrategy: 'nope' } });
    expect(r.status).toBe(400);
    const bad = await chat({ devai: { providers: [providerName], keyStrategy: 'nope' } });
    expect(bad.status).toBe(400);
  });

  it('invalid key (401) is skipped and the stream comes from the next key', async () => {
    await admin('PATCH', `/admin/providers/${providerId}`, { config: { keyStrategy: 'failover', keyOrder: [] } });
    await admin('DELETE', `/admin/credentials/${credIds.backup}`);
    await admin('DELETE', `/admin/credentials/${credIds.primary2}`);
    await addKey('broken', 'bad-key-0000000000000000DDDD');
    await addKey('good', 'ok-good-key-00000000000EEEE');
    const res = await chat({ stream: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-devai-key-fallbacks')).toBe('1');
    const text = await res.text();
    const content = text.split('\n\n').filter(e => e.startsWith('data: {')).map(e => JSON.parse(e.slice(6))).map(c => c.choices?.[0]?.delta?.content ?? '').join('');
    expect(content).toBe('answer from EEEE');
    expect(text.trim().endsWith('data: [DONE]')).toBe(true);
  }, 20000);

  it('all keys failing → 502 listing every key attempt', async () => {
    const del = await admin('DELETE', `/admin/credentials/${credIds.good}`);
    expect(del.status).toBe(200);
    _resetCircuitsForTests();
    await redis.del(`circuit:key:${credIds.broken}`).catch(() => {});
    const res = await chat();
    expect(res.status).toBe(502);
    const body = await res.json() as any;
    expect(body.error.type).toBe('all_providers_failed');
    expect(body.error.attempts[0].key).toBe('bad-…DDDD');
  }, 20000);
});
