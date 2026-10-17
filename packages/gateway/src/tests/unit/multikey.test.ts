import { describe, it, expect, beforeEach } from 'vitest';
import { runSingle, runFastest, runBest, runStream, RouteTarget, AllProvidersFailedError } from '../../engine/strategies.js';
import { CircuitStore } from '../../engine/circuit.js';
import { ChatRequest } from '../../types/index.js';

const request: ChatRequest = { model: 'auto', messages: [{ role: 'user', content: 'hi' }] };

type Behaviour = { fail?: number | 'network'; message?: string; delay?: number; text?: string };

/** A target = one API key of a provider. Several keys share providerId. */
function key(provider: string, keyId: string, b: Behaviour, log: string[] = []): RouteTarget {
  const p: any = {
    id: provider, type: 'mock', name: provider, baseUrl: '',
    chat: (_r: ChatRequest, apiKey: string, opts: any = {}) => new Promise((resolve, reject) => {
      log.push(apiKey);
      const t = setTimeout(() => {
        if (b.fail === 'network') return reject(new Error('fetch failed'));
        if (b.fail) return reject(Object.assign(new Error(b.message ?? `error ${b.fail}`), { status: b.fail }));
        resolve({
          id: 'x', object: 'chat.completion', created: 0, model: 'm',
          choices: [{ index: 0, message: { role: 'assistant', content: b.text ?? `ok via ${apiKey}` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }, b.delay ?? 0);
      opts.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
    }),
  };
  return { provider: p, providerId: provider, providerName: provider, credentialId: keyId, apiKey: keyId, model: `${provider}-model`, keyHint: `${keyId}…hint` };
}

function memoryCircuit(): CircuitStore & { open: Map<string, number> } {
  const open = new Map<string, number>();
  return { open, isOpen: async k => open.has(k), trip: async (k, s) => { open.set(k, s); } };
}

let circuit: ReturnType<typeof memoryCircuit>;
beforeEach(() => { circuit = memoryCircuit(); });

describe('per-key failover inside a provider', () => {
  it('key1 returns 429, key2 succeeds → answer from the same provider', async () => {
    const out = await runSingle([key('gemini', 'key1', { fail: 429 }), key('gemini', 'key2', {}), key('other', 'o1', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('gemini');
    expect(out.selected.credentialId).toBe('key2');
    expect(out.selected.keyHint).toBe('key2…hint');
    expect(out.keyFallbacks).toBe(1);
    expect(out.fallbacks).toBe(0);
    expect(out.response.choices[0].message.content).toBe('ok via key2');
    // only the bad key is cooled down, for 30s
    expect(circuit.open.get('key:key1')).toBe(30);
    expect([...circuit.open.keys()]).toEqual(['key:key1']);
  });

  it('invalid key (401) gets a longer cooldown and the next key is used', async () => {
    const out = await runSingle([key('g', 'bad', { fail: 401 }), key('g', 'good', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.credentialId).toBe('good');
    expect(circuit.open.get('key:bad')).toBe(300);
  });

  it('5xx and timeouts also move to the next key', async () => {
    const out = await runSingle([key('g', 'k1', { fail: 503 }), key('g', 'k2', { fail: 'network' }), key('g', 'k3', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.credentialId).toBe('k3');
    expect(out.keyFallbacks).toBe(2);
    expect(circuit.open.has('k1:g-model')).toBe(true);
  });

  it('skips keys that are cooling down without calling them', async () => {
    const log: string[] = [];
    circuit.open.set('key:k1', 30);
    const out = await runSingle([key('g', 'k1', {}, log), key('g', 'k2', {}, log)], request, { circuit, timeoutMs: 1000 });
    expect(log).toEqual(['k2']);
    expect(out.candidates[0]).toMatchObject({ credentialId: 'k1', status: 'skipped' });
  });

  it('moves to the next provider only after all keys of a provider fail', async () => {
    const log: string[] = [];
    const out = await runSingle([
      key('a', 'a1', { fail: 429 }, log), key('a', 'a2', { fail: 401 }, log), key('b', 'b1', {}, log),
    ], request, { circuit, timeoutMs: 1000 });
    expect(log).toEqual(['a1', 'a2', 'b1']);
    expect(out.selected.providerName).toBe('b');
    expect(out.fallbacks).toBe(1);
    expect(out.keyFallbacks).toBe(0);
  });

  it('a plain bad request does not burn through the other keys', async () => {
    const log: string[] = [];
    const out = await runSingle([
      key('a', 'a1', { fail: 400, message: 'invalid temperature' }, log), key('a', 'a2', {}, log), key('b', 'b1', {}, log),
    ], request, { circuit, timeoutMs: 1000 });
    expect(log).toEqual(['a1', 'b1']);
    expect(out.selected.providerName).toBe('b');
    expect(circuit.open.size).toBe(0);
  });

  it('reports every key attempt when all keys of all providers fail', async () => {
    const err = await runSingle([key('a', 'a1', { fail: 429 }), key('a', 'a2', { fail: 429 })], request, { circuit, timeoutMs: 1000 }).catch(e => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.candidates.map((c: any) => c.credentialId)).toEqual(['a1', 'a2']);
  });

  it('fastest mode: a provider retries with its next key while racing', async () => {
    const out = await runFastest([
      key('a', 'a1', { fail: 429 }), key('a', 'a2', { delay: 10 }), key('b', 'b1', { delay: 200 }),
    ], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.credentialId).toBe('a2');
    expect(out.keyFallbacks).toBe(1);
    expect(out.candidates.find(c => c.providerName === 'b')!.status).toBe('aborted');
  });

  it('best mode: each provider uses key failover before being judged', async () => {
    const out = await runBest([
      key('a', 'a1', { fail: 401 }), key('a', 'a2', { text: 'long answer from a' }), key('b', 'b1', { text: 'short' }),
    ], request, { circuit, timeoutMs: 1000 });
    expect(out.candidates.filter(c => c.status === 'success')).toHaveLength(2);
    expect(out.selected.credentialId).toBe('a2');
  });

  it('streaming uses the same key failover', async () => {
    const out = await runStream('single', [key('a', 'a1', { fail: 429 }), key('a', 'a2', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.credentialId).toBe('a2');
    expect(out.keyFallbacks).toBe(1);
    expect(out.stream.buffered[0].delta).toBe('ok via a2');
  });
});
