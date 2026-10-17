import { AIProvider, ChatStreamChunk } from '../providers/base.js';
import { ChatRequest, ChatResponse, RoutingMode } from '../types/index.js';
import { CircuitStore, classifyFailure, errorStatus, FailureClass } from './circuit.js';

/** One concrete place a request can go: provider + credential (API key) + model. */
export interface RouteTarget {
  provider: AIProvider;
  providerId: string;
  providerName: string;
  credentialId: string;
  apiKey: string;
  model: string;
  /** Masked key for headers/metadata, e.g. "AIza…DyMg" */
  keyHint?: string;
  /** Credential name set in the dashboard */
  keyName?: string;
}

export type CandidateStatus = 'success' | 'error' | 'timeout' | 'aborted' | 'skipped';

export interface CandidateResult {
  providerId: string;
  providerName: string;
  providerType: string;
  credentialId: string;
  model: string;
  status: CandidateStatus;
  latencyMs: number;
  error?: string;
  httpStatus?: number | null;
  response?: ChatResponse;
  keyHint?: string;
  keyName?: string;
}

export interface JudgeDecision {
  index: number;
  reason: string;
  method: 'judge' | 'heuristic' | 'only_candidate';
  judge?: { provider: string; model: string; latencyMs: number; response?: ChatResponse; error?: string; target?: RouteTarget };
}

export type Judge = (request: ChatRequest, candidates: CandidateResult[]) => Promise<JudgeDecision>;

export interface StrategyOptions {
  circuit: CircuitStore;
  /** Per-provider call timeout */
  timeoutMs: number;
  /** Overall timeout for parallel modes */
  overallTimeoutMs?: number;
  judge?: Judge;
  onRateLimited?: (target: RouteTarget) => Promise<void>;
  /** Called after every failed key attempt (used to record the key's last error) */
  onKeyFailure?: (target: RouteTarget, failure: FailureClass, err: any) => void;
}

export interface RouteOutcome {
  mode: RoutingMode;
  response: ChatResponse;
  selected: CandidateResult;
  candidates: CandidateResult[];
  /** Providers (provider+model groups) that failed before the answer */
  fallbacks: number;
  /** Extra API keys tried inside the selected provider before it answered */
  keyFallbacks: number;
  decision?: JudgeDecision;
}

/** A started stream: chunks already pulled (until the first text) plus the rest. */
export interface OpenStream {
  buffered: ChatStreamChunk[];
  rest: AsyncGenerator<ChatStreamChunk>;
  /** Stop the upstream call */
  close: () => void;
}

export interface StreamOutcome extends Omit<RouteOutcome, 'response'> {
  stream: OpenStream;
  /** Set when the stream was synthesised from a full answer (mode best) */
  response?: ChatResponse;
}

export class AllProvidersFailedError extends Error {
  code = 'all_providers_failed';
  constructor(public candidates: CandidateResult[]) {
    super(`All ${candidates.length} provider attempt(s) failed`);
    this.name = 'AllProvidersFailedError';
  }
}

/** Circuit for one key+model (provider/model outage seen through this key). */
export function circuitKey(t: RouteTarget) {
  return `${t.credentialId}:${t.model}`;
}
/** Circuit for one API key across all models (rate limit, invalid key, quota). */
export function keyCircuitKey(t: { credentialId: string }) {
  return `key:${t.credentialId}`;
}

export async function isTargetOpen(t: RouteTarget, circuit: CircuitStore) {
  return (await circuit.isOpen(keyCircuitKey(t))) || (await circuit.isOpen(circuitKey(t)));
}

function base(t: RouteTarget): Omit<CandidateResult, 'status' | 'latencyMs'> {
  return {
    providerId: t.providerId,
    providerName: t.providerName,
    providerType: t.provider.type,
    credentialId: t.credentialId,
    model: t.model,
    keyHint: t.keyHint,
    keyName: t.keyName,
  };
}

/** Targets that share provider+model; each entry is one API key, in the order to try them. */
export interface TargetGroup {
  key: string;
  targets: RouteTarget[];
}

export function groupTargets(targets: RouteTarget[]): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const t of targets) {
    const k = `${t.providerId}:${t.model}`;
    if (!groups.has(k)) groups.set(k, { key: k, targets: [] });
    const g = groups.get(k)!;
    if (!g.targets.some(x => x.credentialId === t.credentialId)) g.targets.push(t);
  }
  return [...groups.values()];
}

function stripDevai(request: ChatRequest): ChatRequest {
  const { devai: _ignored, ...clean } = request;
  return clean;
}

/** Call one target; empty answers count as failures. */
async function callTarget(t: RouteTarget, request: ChatRequest, opts: StrategyOptions, signal?: AbortSignal): Promise<ChatResponse> {
  const res = await t.provider.chat({ ...stripDevai(request), stream: false, model: t.model }, t.apiKey, { signal, timeoutMs: opts.timeoutMs });
  const text = res?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    const e: any = new Error('Provider returned an empty response');
    e.status = 502;
    throw e;
  }
  return res;
}

/** Turn a full response into a one-chunk stream (cache hits, best mode, adapters without streaming). */
export function responseToStream(res: ChatResponse): OpenStream {
  const chunk: ChatStreamChunk = {
    delta: res.choices?.[0]?.message?.content ?? '',
    finishReason: res.choices?.[0]?.finish_reason ?? 'stop',
    usage: res.usage,
    model: res.model,
  };
  return { buffered: [chunk], rest: (async function* () {})(), close: () => {} };
}

/**
 * Open a stream and wait for the first chunk with text, so failover can still happen
 * before anything is sent to the client. Empty streams count as failures.
 */
async function openTargetStream(t: RouteTarget, request: ChatRequest, opts: StrategyOptions, signal?: AbortSignal): Promise<OpenStream> {
  const req = { ...stripDevai(request), stream: true, model: t.model };
  if (!t.provider.chatStream) {
    return responseToStream(await callTarget(t, request, opts, signal));
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const it = t.provider.chatStream(req, t.apiKey, { signal: controller.signal, timeoutMs: opts.timeoutMs });
  const buffered: ChatStreamChunk[] = [];
  try {
    while (true) {
      const { done, value } = await it.next();
      if (done) break;
      buffered.push(value);
      if (value.delta) break;
    }
  } catch (err) {
    controller.abort();
    signal?.removeEventListener('abort', onAbort);
    throw err;
  }
  if (!buffered.some(c => c.delta.trim())) {
    controller.abort();
    signal?.removeEventListener('abort', onAbort);
    const e: any = new Error('Provider returned an empty response');
    e.status = 502;
    throw e;
  }
  return {
    buffered,
    rest: it,
    close: () => { controller.abort(); signal?.removeEventListener('abort', onAbort); it.return?.(undefined).catch(() => {}); },
  };
}

async function onFailure(t: RouteTarget, err: any, opts: StrategyOptions): Promise<FailureClass> {
  const f = classifyFailure(err);
  if (f.scope === 'key') await opts.circuit.trip(keyCircuitKey(t), f.cooldownSec);
  else if (f.scope === 'model') await opts.circuit.trip(circuitKey(t), f.cooldownSec);
  if (errorStatus(err) === 429 && opts.onRateLimited) await opts.onRateLimited(t).catch(() => {});
  try { opts.onKeyFailure?.(t, f, err); } catch { /* ignore */ }
  return f;
}

function failure(t: RouteTarget, err: any, start: number, aborted = false): CandidateResult {
  const timeout = err?.name === 'TimeoutError' || /timeout/i.test(String(err?.message));
  return {
    ...base(t),
    status: aborted ? 'aborted' : timeout ? 'timeout' : 'error',
    latencyMs: Date.now() - start,
    error: aborted ? 'cancelled: another provider answered first' : String(err?.message || err).slice(0, 300),
    httpStatus: errorStatus(err),
  };
}

class GroupFailedError extends Error {}

/**
 * Try one provider+model with each of its keys in order. A failing key is cooled down
 * on its own and the same request is retried with the next key.
 */
async function callGroup<R>(
  g: TargetGroup, opts: StrategyOptions, attempts: CandidateResult[], signal: AbortSignal | undefined,
  call: (t: RouteTarget, signal?: AbortSignal) => Promise<R>,
): Promise<{ target: RouteTarget; result: R; latencyMs: number; keyFallbacks: number; attemptIndex: number }> {
  let keyFallbacks = 0;
  for (const t of g.targets) {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    if (await isTargetOpen(t, opts.circuit)) {
      attempts.push({ ...base(t), status: 'skipped', latencyMs: 0, error: 'key cooling down (recent failure)' });
      continue;
    }
    const start = Date.now();
    try {
      const result = await call(t, signal);
      return { target: t, result, latencyMs: Date.now() - start, keyFallbacks, attemptIndex: attempts.length };
    } catch (err: any) {
      if (signal?.aborted) throw err;
      attempts.push(failure(t, err, start));
      const f = await onFailure(t, err, opts);
      keyFallbacks++;
      if (!f.tryNextKey) break;
    }
  }
  throw new GroupFailedError();
}

/** single: provider groups in priority order; inside each, keys in order, until one answers. */
async function runSequential<R>(targets: RouteTarget[], opts: StrategyOptions, call: (t: RouteTarget, signal?: AbortSignal) => Promise<R>) {
  const candidates: CandidateResult[] = [];
  let fallbacks = 0;
  for (const g of groupTargets(targets)) {
    try {
      const r = await callGroup(g, opts, candidates, undefined, call);
      const selected: CandidateResult = { ...base(r.target), status: 'success', latencyMs: r.latencyMs };
      candidates.push(selected);
      return { selected, result: r.result, candidates, fallbacks, keyFallbacks: r.keyFallbacks };
    } catch (err) {
      if (!(err instanceof GroupFailedError)) throw err;
      if (candidates.some(c => c.providerId === g.targets[0].providerId && c.status !== 'skipped')) fallbacks++;
    }
  }
  throw new AllProvidersFailedError(candidates);
}

export async function runSingle(targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions): Promise<RouteOutcome> {
  const r = await runSequential(targets, opts, (t, s) => callTarget(t, request, opts, s));
  r.selected.response = r.result;
  return { mode: 'single', response: r.result, selected: r.selected, candidates: r.candidates, fallbacks: r.fallbacks, keyFallbacks: r.keyFallbacks };
}

interface GroupResult<R> {
  attempts: CandidateResult[];
  selected?: CandidateResult;
  result?: R;
  keyFallbacks: number;
}

/** Run all provider groups concurrently (each with its own key failover). `stopOnFirst` cancels the rest once one succeeds. */
async function fanOut<R>(
  targets: RouteTarget[], opts: StrategyOptions, stopOnFirst: boolean,
  call: (t: RouteTarget, signal?: AbortSignal) => Promise<R>, dispose?: (r: R) => void,
) {
  const groups = groupTargets(targets);
  const out: GroupResult<R>[] = groups.map(() => ({ attempts: [], keyFallbacks: 0 }));
  const finished: boolean[] = groups.map(() => false);
  const controllers = groups.map(() => new AbortController());
  const overall = opts.overallTimeoutMs ?? opts.timeoutMs;
  let winner: number | null = null;

  await new Promise<void>((resolve) => {
    let pending = groups.length;
    if (!pending) return resolve();
    const timer = setTimeout(() => {
      controllers.forEach((c, i) => {
        if (!finished[i]) c.abort(Object.assign(new Error(`timeout after ${overall}ms (overall)`), { name: 'TimeoutError' }));
      });
    }, overall);
    const done = () => {
      if (--pending === 0) { clearTimeout(timer); resolve(); }
    };
    groups.forEach((g, i) => {
      const startAll = Date.now();
      callGroup(g, opts, out[i].attempts, controllers[i].signal, call)
        .then((r) => {
          if (finished[i]) { dispose?.(r.result); return; } // already cancelled
          finished[i] = true;
          out[i].selected = { ...base(r.target), status: 'success', latencyMs: r.latencyMs };
          out[i].result = r.result;
          out[i].keyFallbacks = r.keyFallbacks;
          if (stopOnFirst && winner === null) {
            winner = i;
            controllers.forEach((c, j) => {
              if (j !== i && !finished[j]) {
                finished[j] = true;
                const t = groups[j].targets.find(x => !out[j].attempts.some(a => a.credentialId === x.credentialId)) ?? groups[j].targets[0];
                out[j].attempts.push({ ...failure(t, null, startAll, true), latencyMs: Date.now() - startAll });
                c.abort(new Error('cancelled'));
              }
            });
            clearTimeout(timer);
            resolve(); // don't wait for cancelled calls to settle
          }
        })
        .catch((err) => {
          if (finished[i]) return; // cancelled because another won
          finished[i] = true;
          const sig = controllers[i].signal;
          if (sig.aborted && !(err instanceof GroupFailedError)) {
            // overall timeout hit while a key was in flight
            const t = groups[i].targets.find(x => !out[i].attempts.some(a => a.credentialId === x.credentialId)) ?? groups[i].targets[0];
            out[i].attempts.push(failure(t, sig.reason, startAll));
          }
        })
        .finally(done);
    });
  });

  return { groups: out, winner };
}

function flatten<R>(groups: GroupResult<R>[]): CandidateResult[] {
  return groups.flatMap(g => (g.selected ? [...g.attempts, g.selected] : g.attempts));
}

/** fastest: first valid answer wins; slower calls are aborted. */
export async function runFastest(targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions): Promise<RouteOutcome> {
  const { groups, winner } = await fanOut(targets, opts, true, (t, s) => callTarget(t, request, opts, s));
  const candidates = flatten(groups);
  if (winner === null) throw new AllProvidersFailedError(candidates);
  const w = groups[winner];
  w.selected!.response = w.result!;
  return { mode: 'fastest', response: w.result!, selected: w.selected!, candidates, fallbacks: 0, keyFallbacks: w.keyFallbacks };
}

/** Heuristic used when no judge is available: prefer complete answers, then longer ones. */
export function heuristicPick(candidates: CandidateResult[]): JudgeDecision {
  let best = 0;
  let bestScore = -Infinity;
  candidates.forEach((c, i) => {
    const r = c.response!;
    const text = r.choices[0].message.content;
    const score = (r.choices[0].finish_reason === 'stop' ? 1e6 : 0) + Math.min(text.length, 20000) - c.latencyMs / 1000;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return { index: best, method: 'heuristic', reason: 'Judge unavailable; picked the most complete answer (finished normally, longest).' };
}

/** best: wait for all (bounded by overall timeout), then let the judge choose. */
export async function runBest(targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions): Promise<RouteOutcome> {
  const { groups } = await fanOut(targets, opts, false, (t, s) => callTarget(t, request, opts, s));
  for (const g of groups) if (g.selected) g.selected.response = g.result;
  const candidates = flatten(groups);
  const okGroups = groups.filter(g => g.selected);
  const ok = okGroups.map(g => g.selected!);
  if (!ok.length) throw new AllProvidersFailedError(candidates);

  let decision: JudgeDecision;
  if (ok.length === 1) {
    decision = { index: 0, method: 'only_candidate', reason: 'Only one provider returned a valid answer.' };
  } else if (opts.judge) {
    try {
      decision = await opts.judge(request, ok);
      if (!(decision.index >= 0 && decision.index < ok.length)) throw new Error('judge returned an invalid index');
    } catch (err: any) {
      decision = { ...heuristicPick(ok), judge: err?.judge ?? { provider: 'unknown', model: 'unknown', latencyMs: 0, error: String(err?.message || err) } };
    }
  } else {
    decision = heuristicPick(ok);
  }
  const selected = ok[decision.index];
  return { mode: 'best', response: selected.response!, selected, candidates, fallbacks: 0, keyFallbacks: okGroups[decision.index].keyFallbacks, decision };
}

export function runStrategy(mode: RoutingMode, targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions) {
  if (mode === 'fastest') return runFastest(targets, request, opts);
  if (mode === 'best') return runBest(targets, request, opts);
  return runSingle(targets, request, opts);
}

/**
 * Streaming:
 *  - single: key/provider failover until a stream produces its first text (nothing is sent before that)
 *  - fastest: all providers race; the first to produce text streams, the others are cancelled
 *  - best: needs every full answer for the judge, so the chosen answer is sent as one chunk
 */
export async function runStream(mode: RoutingMode, targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions): Promise<StreamOutcome> {
  if (mode === 'best') {
    const r = await runBest(targets, request, opts);
    return { ...r, stream: responseToStream(r.response) };
  }
  const open = (t: RouteTarget, s?: AbortSignal) => openTargetStream(t, request, opts, s);
  if (mode === 'fastest') {
    const { groups, winner } = await fanOut(targets, opts, true, open, (s) => s.close());
    const candidates = flatten(groups);
    if (winner === null) throw new AllProvidersFailedError(candidates);
    const w = groups[winner];
    return { mode, stream: w.result!, selected: w.selected!, candidates, fallbacks: 0, keyFallbacks: w.keyFallbacks };
  }
  const r = await runSequential(targets, opts, open);
  return { mode: 'single', stream: r.result, selected: r.selected, candidates: r.candidates, fallbacks: r.fallbacks, keyFallbacks: r.keyFallbacks };
}
