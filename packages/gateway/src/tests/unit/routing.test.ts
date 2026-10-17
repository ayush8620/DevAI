import { describe, it, expect, beforeEach } from 'vitest';
import { runSingle, runFastest, runBest, RouteTarget, AllProvidersFailedError } from '../../engine/strategies.js';
import { CircuitStore } from '../../engine/circuit.js';
import { resolveRouting } from '../../engine/router.js';
import { ChatRequest } from '../../types/index.js';

const request: ChatRequest = { model: 'auto', messages: [{ role: 'user', content: 'hi' }] };

function reply(text: string) {
  return {
    id: 'x', object: 'chat.completion' as const, created: 0, model: 'm',
    choices: [{ index: 0, message: { role: 'assistant' as const, content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  };
}

type Behaviour = { delay?: number; fail?: number | 'network'; text?: string };

function target(name: string, b: Behaviour, log: string[] = []): RouteTarget & { aborted: () => boolean } {
  let wasAborted = false;
  const provider: any = {
    id: name, type: 'mock', name, baseUrl: '',
    chat: (_req: ChatRequest, _key: string, opts: any = {}) => new Promise((resolve, reject) => {
      log.push(name);
      const t = setTimeout(() => {
        if (b.fail === 'network') return reject(new Error('fetch failed'));
        if (b.fail) return reject(Object.assign(new Error(`${name} error ${b.fail}`), { status: b.fail }));
        resolve(reply(b.text ?? `answer from ${name}`));
      }, b.delay ?? 0);
      opts.signal?.addEventListener('abort', () => { wasAborted = true; clearTimeout(t); reject(new Error('aborted')); });
      if (opts.timeoutMs && (b.delay ?? 0) > opts.timeoutMs) {
        setTimeout(() => { clearTimeout(t); reject(Object.assign(new Error(`timeout after ${opts.timeoutMs}ms`), { name: 'TimeoutError' })); }, opts.timeoutMs);
      }
    }),
  };
  return { provider, providerId: name, providerName: name, credentialId: `cred-${name}`, apiKey: 'k', model: `${name}-model`, aborted: () => wasAborted };
}

function memoryCircuit(): CircuitStore & { open: Set<string> } {
  const open = new Set<string>();
  return { open, isOpen: async k => open.has(k), trip: async k => { open.add(k); } };
}

let circuit: ReturnType<typeof memoryCircuit>;
beforeEach(() => { circuit = memoryCircuit(); });

describe('single mode (failover)', () => {
  it('falls back to the next provider when the first fails', async () => {
    const out = await runSingle([target('a', { fail: 503 }), target('b', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('b');
    expect(out.fallbacks).toBe(1);
    expect(out.response.choices[0].message.content).toBe('answer from b');
    expect(circuit.open.has('cred-a:a-model')).toBe(true);
  });

  it('fails over on 429, network errors and timeouts', async () => {
    const out = await runSingle([
      target('a', { fail: 429 }), target('b', { fail: 'network' }), target('c', { delay: 200 }), target('d', {}),
    ], request, { circuit, timeoutMs: 50 });
    expect(out.selected.providerName).toBe('d');
    expect(out.fallbacks).toBe(3);
    expect(out.candidates.map(c => c.status)).toEqual(['error', 'error', 'timeout', 'success']);
  });

  it('skips providers whose circuit is open', async () => {
    const log: string[] = [];
    circuit.open.add('cred-a:a-model');
    const out = await runSingle([target('a', {}, log), target('b', {}, log)], request, { circuit, timeoutMs: 1000 });
    expect(log).toEqual(['b']);
    expect(out.candidates[0].status).toBe('skipped');
  });

  it('throws AllProvidersFailedError with every attempt when all are down', async () => {
    const err = await runSingle([target('a', { fail: 500 }), target('b', { fail: 'network' })], request, { circuit, timeoutMs: 1000 })
      .catch(e => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.candidates).toHaveLength(2);
  });

  it('treats an empty answer as a failure', async () => {
    const out = await runSingle([target('a', { text: '  ' }), target('b', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('b');
  });
});

describe('fastest mode', () => {
  it('returns the first valid answer and aborts slower providers', async () => {
    const slow = target('slow', { delay: 300 });
    const start = Date.now();
    const out = await runFastest([slow, target('fast', { delay: 20 })], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('fast');
    expect(Date.now() - start).toBeLessThan(250);
    expect(slow.aborted()).toBe(true);
    expect(out.candidates.find(c => c.providerName === 'slow')!.status).toBe('aborted');
  });

  it('ignores a provider that fails quickly', async () => {
    const out = await runFastest([target('bad', { fail: 500 }), target('ok', { delay: 30 })], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('ok');
  });

  it('throws when every provider fails', async () => {
    await expect(runFastest([target('a', { fail: 500 }), target('b', { fail: 503 })], request, { circuit, timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(AllProvidersFailedError);
  });
});

describe('best mode', () => {
  it('waits for all answers and returns the judge pick with its reason', async () => {
    const out = await runBest([target('a', { text: 'short' }), target('b', { delay: 30, text: 'detailed answer' })], request, {
      circuit, timeoutMs: 1000,
      judge: async (_r, cands) => ({ index: cands.findIndex(c => c.providerName === 'b'), method: 'judge', reason: 'b is more complete' }),
    });
    expect(out.selected.providerName).toBe('b');
    expect(out.decision?.method).toBe('judge');
    expect(out.decision?.reason).toBe('b is more complete');
    expect(out.candidates.filter(c => c.status === 'success')).toHaveLength(2);
  });

  it('falls back to the heuristic when the judge fails', async () => {
    const out = await runBest([target('a', { text: 'short' }), target('b', { text: 'a much longer answer' })], request, {
      circuit, timeoutMs: 1000, judge: async () => { throw new Error('judge down'); },
    });
    expect(out.decision?.method).toBe('heuristic');
    expect(out.selected.providerName).toBe('b');
  });

  it('times out slow providers without failing the request', async () => {
    const out = await runBest([target('slow', { delay: 500 }), target('ok', { delay: 10 })], request, {
      circuit, timeoutMs: 100, overallTimeoutMs: 150,
    });
    expect(out.selected.providerName).toBe('ok');
    expect(out.decision?.method).toBe('only_candidate');
    expect(out.candidates.find(c => c.providerName === 'slow')!.status).toBe('timeout');
  });
});

describe('resolveRouting', () => {
  it('defaults to single', () => {
    expect(resolveRouting(request, {}).mode).toBe('single');
  });
  it('uses app default, then header, then request body', () => {
    expect(resolveRouting(request, { mode: 'best' }).mode).toBe('best');
    expect(resolveRouting(request, { mode: 'best' }, 'fastest').mode).toBe('fastest');
    expect(resolveRouting({ ...request, devai: { mode: 'single' } }, { mode: 'best' }, 'fastest').mode).toBe('single');
  });
  it('ignores an unknown header mode', () => {
    expect(resolveRouting(request, {}, 'weird').mode).toBe('single');
  });
});
