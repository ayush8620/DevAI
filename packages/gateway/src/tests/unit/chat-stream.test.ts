import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-level test of POST /v1/chat/completions with stream:true. DB, Redis, auth and
// routing are mocked so this only checks the SSE contract, headers, usage and caching.
const h = vi.hoisted(() => ({
  recordUsage: vi.fn(async () => {}),
  setCachedResponse: vi.fn(async () => {}),
  getCachedResponse: vi.fn(async () => null as any),
  routeStreamRequest: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => { c.set('projectId', 'p1'); c.set('project', { id: 'p1', routing: {} }); await next(); },
}));
vi.mock('../../services/usage.js', () => ({ recordUsage: h.recordUsage, getOverallUsageSummary: vi.fn(), getRecentRequests: vi.fn(), getUsageByProvider: vi.fn(), getUsageByModel: vi.fn(), getUsageSummary: vi.fn() }));
vi.mock('../../services/cache.js', () => ({ getCachedResponse: h.getCachedResponse, setCachedResponse: h.setCachedResponse }));
vi.mock('../../engine/quota.js', () => ({ consumeQuota: vi.fn(async () => {}), checkQuota: vi.fn(async () => true) }));
vi.mock('../../engine/key-usage.js', () => ({ recordKeyUse: vi.fn(async () => {}), getKeyUsage: vi.fn(async () => ({})), nextRoundRobin: vi.fn(async () => 0) }));
vi.mock('../../engine/router.js', async (orig) => {
  const real: any = await orig();
  return { ...real, routeStreamRequest: h.routeStreamRequest };
});

import { app } from '../../app.js';
import { AllProvidersFailedError } from '../../engine/strategies.js';

function outcome(pieces: { delta: string; finishReason?: string; usage?: any }[], extra: any = {}) {
  const selected = { providerId: 'prov', providerName: 'Gemini', providerType: 'google', credentialId: 'cred2', model: 'gemini-2.5-flash', status: 'success', latencyMs: 5, keyHint: 'AIza…DyMg', keyName: 'Backup' };
  return {
    mode: 'single', selected, fallbacks: 0, keyFallbacks: 1,
    candidates: [{ ...selected, credentialId: 'cred1', status: 'error', error: 'rate limited', keyHint: 'AIza…AAAA' }, selected],
    stream: { buffered: [pieces[0]], rest: (async function* () { for (const p of pieces.slice(1)) yield p; })(), close: vi.fn() },
    ...extra,
  };
}

const post = (body: any, headers: Record<string, string> = {}) => app.request('/v1/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dvai_x', ...headers }, body: JSON.stringify(body),
});

function events(text: string) {
  return text.split('\n\n').filter(Boolean).map(e => e.replace(/^data: /, ''));
}

const flush = () => new Promise(r => setTimeout(r, 20));

beforeEach(() => { vi.clearAllMocks(); h.getCachedResponse.mockResolvedValue(null); });

describe('POST /v1/chat/completions stream:true', () => {
  it('returns OpenAI-compatible SSE ending with [DONE], routing headers, usage and cache after the end', async () => {
    h.routeStreamRequest.mockResolvedValue(outcome([
      { delta: 'Hel' }, { delta: 'lo' }, { delta: '', finishReason: 'stop', usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
    ]));
    const res = await post({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }], stream: true, stream_options: { include_usage: true } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-devai-provider')).toBe('Gemini/gemini-2.5-flash');
    expect(res.headers.get('x-devai-key')).toBe('Backup (AIza...DyMg)');
    expect(res.headers.get('x-devai-key-fallbacks')).toBe('1');
    expect(res.headers.get('x-cache')).toBe('MISS');

    const ev = events(await res.text());
    expect(ev.at(-1)).toBe('[DONE]');
    const chunks = ev.slice(0, -1).map(e => JSON.parse(e));
    expect(chunks[0]).toMatchObject({ object: 'chat.completion.chunk', choices: [{ delta: { role: 'assistant', content: 'Hel' }, finish_reason: null }] });
    expect(chunks.map(c => c.choices[0]?.delta?.content ?? '').join('')).toBe('Hello');
    expect(chunks.find(c => c.choices[0]?.finish_reason)?.choices[0].finish_reason).toBe('stop');
    expect(chunks.at(-1)).toMatchObject({ choices: [], usage: { total_tokens: 5 } });

    await flush();
    // failed key attempt + final selected call are both recorded; the stream one after it ended
    const rows = h.recordUsage.mock.calls.map((c: any) => c[0]);
    expect(rows.find((r: any) => r.credentialId === 'cred1')).toMatchObject({ status: 502 });
    expect(rows.find((r: any) => r.credentialId === 'cred2')).toMatchObject({ status: 200, totalTokens: 5, cacheHit: false });
    expect(h.setCachedResponse).toHaveBeenCalledTimes(1);
    expect((h.setCachedResponse.mock.calls[0] as any)[1].choices[0].message.content).toBe('Hello');
  });

  it('serves a cache hit as a stream', async () => {
    h.getCachedResponse.mockResolvedValue({ id: 'c', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'cached!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    const res = await post({ messages: [{ role: 'user', content: 'hi' }], stream: true });
    expect(res.headers.get('x-cache')).toBe('HIT');
    const ev = events(await res.text());
    expect(JSON.parse(ev[0]).choices[0].delta.content).toBe('cached!');
    expect(ev.at(-1)).toBe('[DONE]');
    expect(h.routeStreamRequest).not.toHaveBeenCalled();
  });

  it('does not cache an answer cut off by an error mid-stream, and reports the error in-stream', async () => {
    const o = outcome([{ delta: 'part' }]);
    o.stream.rest = (async function* () { yield { delta: 'ial' }; throw new Error('connection reset'); })();
    h.routeStreamRequest.mockResolvedValue(o);
    const res = await post({ messages: [{ role: 'user', content: 'hi' }], stream: true });
    const ev = events(await res.text());
    expect(ev.some(e => e.includes('"stream_error"'))).toBe(true);
    expect(ev.at(-1)).toBe('[DONE]');
    await flush();
    expect(h.setCachedResponse).not.toHaveBeenCalled();
    expect(h.recordUsage.mock.calls.map((c: any) => c[0]).find((r: any) => r.credentialId === 'cred2')).toMatchObject({ status: 502 });
  });

  it('returns a JSON 502 (not a stream) when every provider fails before the first byte', async () => {
    h.routeStreamRequest.mockRejectedValue(new AllProvidersFailedError([{ providerId: 'p', providerName: 'Gemini', providerType: 'google', credentialId: 'c', model: 'm', status: 'error', latencyMs: 1, error: '429' }]));
    const res = await post({ messages: [{ role: 'user', content: 'hi' }], stream: true });
    expect(res.status).toBe(502);
    expect((await res.json()).error.type).toBe('all_providers_failed');
  });

  it('streamed requests skip the cache for non-default routing', async () => {
    h.routeStreamRequest.mockResolvedValue(outcome([{ delta: 'x', finishReason: 'stop' }]));
    const res = await post({ messages: [{ role: 'user', content: 'hi' }], stream: true, devai: { mode: 'fastest' } });
    await res.text();
    await flush();
    expect(h.getCachedResponse).not.toHaveBeenCalled();
    expect(h.setCachedResponse).not.toHaveBeenCalled();
  });
});
