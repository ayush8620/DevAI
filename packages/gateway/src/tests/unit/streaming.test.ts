import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readSSE } from '../../providers/sse.js';
import { parseOpenAIStream, openAIBody } from '../../providers/openai-compatible.js';
import { GoogleProvider, thinkingFor } from '../../providers/google/adapter.js';
import { OpenAIProvider } from '../../providers/openai/adapter.js';
import { AnthropicProvider } from '../../providers/anthropic/adapter.js';
import { runStream, RouteTarget, AllProvidersFailedError } from '../../engine/strategies.js';
import { CircuitStore } from '../../engine/circuit.js';
import { ChatRequest } from '../../types/index.js';
import { ChatStreamChunk } from '../../providers/base.js';

/** A Response whose body arrives in the given raw pieces (to test chunk boundaries). */
function sseResponse(pieces: string[], status = 200) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const p of pieces) c.enqueue(enc.encode(p)); c.close(); },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

async function collect<T>(it: AsyncIterable<T>) {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('readSSE', () => {
  it('parses events split across network chunks, CRLF and multi-line data', async () => {
    const res = sseResponse(['data: {"a":', '1}\r\n\r\n: comment\n', 'event: x\ndata: line1\ndata: line2\n\n', 'data: [DONE]\n\n']);
    expect(await collect(readSSE(res))).toEqual(['{"a":1}', 'line1\nline2', '[DONE]']);
  });

  it('fails with a timeout when the provider goes silent', async () => {
    const body = new ReadableStream<Uint8Array>({ start() { /* never sends */ } });
    const err = await collect(readSSE(new Response(body), { idleTimeoutMs: 30 })).catch(e => e);
    expect(err.name).toBe('TimeoutError');
  });
});

describe('OpenAI-compatible streams', () => {
  it('maps chunks, finish reason and usage; stops at [DONE]', async () => {
    const res = sseResponse([
      'data: {"model":"gpt","choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n', 'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
    ]);
    const chunks = await collect(parseOpenAIStream(res, {}));
    expect(chunks.map(c => c.delta).join('')).toBe('Hello');
    expect(chunks.find(c => c.finishReason)?.finishReason).toBe('stop');
    expect(chunks.at(-1)?.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
  });

  it('never forwards DevAI fields and sets stream flags', () => {
    const body = openAIBody({ model: 'm', messages: [], stream: true, devai: { mode: 'best' } } as any, true);
    expect(body).toEqual({ model: 'm', messages: [], stream: true, stream_options: { include_usage: true } });
    expect(openAIBody({ model: 'm', messages: [], stream: true } as any, false).stream).toBe(false);
  });
});

describe('provider adapters (mocked fetch)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('Gemini streams via streamGenerateContent?alt=sse, skips thoughts and reports usage', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"thinking...","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi "}]}}],"modelVersion":"gemini-2.5-flash"}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"there"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"totalTokenCount":6}}\n\n',
    ]));
    const p = new GoogleProvider('g', 'Gemini');
    const chunks: ChatStreamChunk[] = await collect(p.chatStream({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 200 }, 'KEY'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(init.headers['x-goog-api-key']).toBe('KEY');
    expect(String(url)).not.toContain('KEY');
    expect(chunks.map(c => c.delta).join('')).toBe('Hi there');
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'stop', usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } });
  });

  it('Gemini stream errors before the first byte carry the HTTP status (for failover)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), { status: 429 }));
    const p = new GoogleProvider('g', 'Gemini');
    const err = await collect(p.chatStream({ model: 'gemini-2.5-flash', messages: [] }, 'K')).catch(e => e);
    expect(err.status).toBe(429);
  });

  it('OpenAI adapter streams and sends stream_options', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n', 'data: [DONE]\n\n']));
    const chunks = await collect(new OpenAIProvider('o', 'OpenAI').chatStream({ model: 'gpt-4o-mini', messages: [] }, 'sk'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(chunks[0].delta).toBe('ok');
  });

  it('OpenAI non-stream chat forces stream:false even if the client asked to stream', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] })));
    await new OpenAIProvider('o', 'OpenAI').chat({ model: 'gpt-4o-mini', messages: [], stream: true }, 'sk');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(false);
  });

  it('Anthropic streams text deltas and usage', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]));
    const chunks = await collect(new AnthropicProvider('a', 'Claude').chatStream({ model: 'claude-3-5-haiku', messages: [{ role: 'user', content: 'hi' }] }, 'k'));
    expect(chunks.map(c => c.delta).join('')).toBe('Yo');
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'stop', usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } });
  });
});

describe('Gemini thinking budget (cut-off answers)', () => {
  const p = new GoogleProvider('g', 'Gemini');
  const req = (model: string, max_tokens?: number) => p.buildRequest({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens }) as any;

  it('2.5 Flash: thinking off so max_tokens is all answer', () => {
    expect(req('gemini-2.5-flash', 200).generationConfig).toEqual({ maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } });
    expect(req('gemini-2.5-flash-lite', 50).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
  it('2.5 Pro: minimum thinking budget added on top of max_tokens', () => {
    expect(req('gemini-2.5-pro', 200).generationConfig).toEqual({ maxOutputTokens: 328, thinkingConfig: { thinkingBudget: 128 } });
  });
  it('Gemini 3: low thinking level with headroom; Gemma 4 headroom only (it rejects thinkingConfig); Gemma 3 unchanged', () => {
    expect(req('gemini-3-flash-preview', 200).generationConfig).toEqual({ maxOutputTokens: 1224, thinkingConfig: { thinkingLevel: 'low' } });
    expect(req('gemma-4-31b-it', 200).generationConfig).toEqual({ maxOutputTokens: 1224 });
    expect(req('gemma-3-27b-it', 200).generationConfig).toEqual({ maxOutputTokens: 200 });
  });
  it('no max_tokens → no thinking override', () => {
    expect(req('gemini-2.5-flash').generationConfig).toBeUndefined();
    expect(thinkingFor('gemini-2.5-flash').config).toEqual({ thinkingBudget: 0 });
  });
});

// ---- runStream (routing) ----
const request: ChatRequest = { model: 'auto', messages: [{ role: 'user', content: 'hi' }], stream: true };
type SB = { failOpen?: number; pieces?: string[]; delay?: number; failMid?: boolean };

function streamTarget(name: string, b: SB, state: { closed?: boolean } = {}): RouteTarget {
  const provider: any = {
    id: name, type: 'mock', name, baseUrl: '',
    chat: async () => { throw new Error('should stream'); },
    async *chatStream(_r: ChatRequest, _k: string, opts: any = {}) {
      opts.signal?.addEventListener('abort', () => { state.closed = true; });
      if (b.delay) await new Promise(r => setTimeout(r, b.delay));
      if (opts.signal?.aborted) throw new Error('aborted');
      if (b.failOpen) throw Object.assign(new Error(`${name} ${b.failOpen}`), { status: b.failOpen });
      for (const p of b.pieces ?? [`hello from ${name}`]) yield { delta: p };
      if (b.failMid) throw new Error('connection reset');
      yield { delta: '', finishReason: 'stop', usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } };
    },
  };
  return { provider, providerId: name, providerName: name, credentialId: `c-${name}`, apiKey: 'k', model: `${name}-m` };
}

function memoryCircuit(): CircuitStore {
  const open = new Set<string>();
  return { isOpen: async k => open.has(k), trip: async k => { open.add(k); } };
}

describe('runStream', () => {
  let circuit: CircuitStore;
  beforeEach(() => { circuit = memoryCircuit(); });

  it('fails over before the first byte', async () => {
    const out = await runStream('single', [streamTarget('a', { failOpen: 503 }), streamTarget('b', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('b');
    expect(out.fallbacks).toBe(1);
    const rest = await collect(out.stream.rest);
    expect([...out.stream.buffered, ...rest].map(c => c.delta).join('')).toBe('hello from b');
    expect(rest.at(-1)?.usage?.total_tokens).toBe(3);
  });

  it('an empty stream counts as a failure', async () => {
    const out = await runStream('single', [streamTarget('a', { pieces: ['', ' '] }), streamTarget('b', {})], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('b');
  });

  it('throws AllProvidersFailedError (→ JSON 502) when nobody can start streaming', async () => {
    await expect(runStream('single', [streamTarget('a', { failOpen: 500 })], request, { circuit, timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(AllProvidersFailedError);
  });

  it('fastest: first provider to produce text streams, the other is cancelled', async () => {
    const slow = { closed: false };
    const out = await runStream('fastest', [streamTarget('slow', { delay: 200 }, slow), streamTarget('fast', { delay: 5 })], request, { circuit, timeoutMs: 1000 });
    expect(out.selected.providerName).toBe('fast');
    expect(slow.closed).toBe(true);
  });

  it('best: streams the judged answer as one chunk', async () => {
    const t1 = streamTarget('a', {});
    (t1.provider as any).chat = async () => ({ id: 'x', object: 'chat.completion', created: 0, model: 'a', choices: [{ index: 0, message: { role: 'assistant', content: 'full answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    const out = await runStream('best', [t1], request, { circuit, timeoutMs: 1000 });
    expect(out.stream.buffered[0].delta).toBe('full answer');
  });

  it('adapters without native streaming fall back to one chunk', async () => {
    const t = streamTarget('plain', {});
    delete (t.provider as any).chatStream;
    (t.provider as any).chat = async () => ({ id: 'x', object: 'chat.completion', created: 0, model: 'p', choices: [{ index: 0, message: { role: 'assistant', content: 'whole' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    const out = await runStream('single', [t], request, { circuit, timeoutMs: 1000 });
    expect(out.stream.buffered).toEqual([{ delta: 'whole', finishReason: 'stop', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'p' }]);
  });
});
