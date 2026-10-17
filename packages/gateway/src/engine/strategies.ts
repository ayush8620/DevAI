import { AIProvider } from '../providers/base.js';
import { ChatRequest, ChatResponse, RoutingMode } from '../types/index.js';
import { CircuitStore, shouldTripCircuit, cooldownFor, errorStatus } from './circuit.js';

/** One concrete place a request can go: provider + credential + model. */
export interface RouteTarget {
  provider: AIProvider;
  providerId: string;
  providerName: string;
  credentialId: string;
  apiKey: string;
  model: string;
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
}

export interface RouteOutcome {
  mode: RoutingMode;
  response: ChatResponse;
  selected: CandidateResult;
  candidates: CandidateResult[];
  fallbacks: number;
  decision?: JudgeDecision;
}

export class AllProvidersFailedError extends Error {
  code = 'all_providers_failed';
  constructor(public candidates: CandidateResult[]) {
    super(`All ${candidates.length} provider attempt(s) failed`);
    this.name = 'AllProvidersFailedError';
  }
}

export function circuitKey(t: RouteTarget) {
  return `${t.credentialId}:${t.model}`;
}

function base(t: RouteTarget): Omit<CandidateResult, 'status' | 'latencyMs'> {
  return {
    providerId: t.providerId,
    providerName: t.providerName,
    providerType: t.provider.type,
    credentialId: t.credentialId,
    model: t.model,
  };
}

/** Call one target; empty answers count as failures. */
async function callTarget(t: RouteTarget, request: ChatRequest, opts: StrategyOptions, signal?: AbortSignal): Promise<ChatResponse> {
  const { devai: _ignored, ...clean } = request;
  const res = await t.provider.chat({ ...clean, model: t.model }, t.apiKey, { signal, timeoutMs: opts.timeoutMs });
  const text = res?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    const e: any = new Error('Provider returned an empty response');
    e.status = 502;
    throw e;
  }
  return res;
}

async function onFailure(t: RouteTarget, err: any, opts: StrategyOptions) {
  if (shouldTripCircuit(err)) await opts.circuit.trip(circuitKey(t), cooldownFor(err));
  if (errorStatus(err) === 429 && opts.onRateLimited) await opts.onRateLimited(t).catch(() => {});
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

/** Drop targets whose circuit is open; they are reported as skipped. */
async function partition(targets: RouteTarget[], opts: StrategyOptions) {
  const live: RouteTarget[] = [];
  const skipped: CandidateResult[] = [];
  for (const t of targets) {
    if (await opts.circuit.isOpen(circuitKey(t))) {
      skipped.push({ ...base(t), status: 'skipped', latencyMs: 0, error: 'circuit open (recent failure, cooling down)' });
    } else live.push(t);
  }
  return { live, skipped };
}

/** single: try targets in priority order until one answers. */
export async function runSingle(targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions): Promise<RouteOutcome> {
  const { live, skipped } = await partition(targets, opts);
  const candidates: CandidateResult[] = [...skipped];
  let fallbacks = 0;
  for (const t of live) {
    const start = Date.now();
    try {
      const response = await callTarget(t, request, opts);
      const selected: CandidateResult = { ...base(t), status: 'success', latencyMs: Date.now() - start, response };
      candidates.push(selected);
      return { mode: 'single', response, selected, candidates, fallbacks };
    } catch (err: any) {
      candidates.push(failure(t, err, start));
      await onFailure(t, err, opts);
      fallbacks++;
    }
  }
  throw new AllProvidersFailedError(candidates);
}

/** Run all live targets concurrently. `stopOnFirst` aborts the rest once one succeeds. */
async function fanOut(targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions, stopOnFirst: boolean) {
  const { live, skipped } = await partition(targets, opts);
  const results: CandidateResult[] = new Array(live.length);
  const controllers = live.map(() => new AbortController());
  const overall = opts.overallTimeoutMs ?? opts.timeoutMs;
  let winner: number | null = null;

  await new Promise<void>((resolve) => {
    let pending = live.length;
    if (!pending) return resolve();
    const timer = setTimeout(() => {
      controllers.forEach((c, i) => {
        if (!results[i]) c.abort(new Error('overall timeout'));
      });
    }, overall);
    const done = () => {
      if (--pending === 0) { clearTimeout(timer); resolve(); }
    };
    live.forEach((t, i) => {
      const start = Date.now();
      callTarget(t, request, opts, controllers[i].signal)
        .then((response) => {
          if (results[i]) return; // already marked aborted
          results[i] = { ...base(t), status: 'success', latencyMs: Date.now() - start, response };
          if (stopOnFirst && winner === null) {
            winner = i;
            controllers.forEach((c, j) => {
              if (j !== i && !results[j]) {
                results[j] = failure(live[j], null, start, true);
                results[j].latencyMs = Date.now() - start;
                c.abort(new Error('cancelled'));
              }
            });
            clearTimeout(timer);
            resolve(); // don't wait for cancelled calls to settle
          }
        })
        .catch(async (err) => {
          if (results[i]) return; // aborted because another won
          const overallTimeout = controllers[i].signal.aborted;
          results[i] = failure(t, overallTimeout ? Object.assign(new Error(`timeout after ${overall}ms (overall)`), { name: 'TimeoutError' }) : err, start);
          if (!overallTimeout) await onFailure(t, err, opts);
        })
        .finally(done);
    });
  });

  return { skipped, results: results.map((r, i) => r ?? failure(live[i], new Error('no result'), Date.now())), winner };
}

/** fastest: first valid answer wins; slower calls are aborted. */
export async function runFastest(targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions): Promise<RouteOutcome> {
  const { skipped, results, winner } = await fanOut(targets, request, opts, true);
  const candidates = [...results, ...skipped];
  if (winner === null) throw new AllProvidersFailedError(candidates);
  const selected = results[winner];
  return { mode: 'fastest', response: selected.response!, selected, candidates, fallbacks: 0 };
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
  const { skipped, results } = await fanOut(targets, request, opts, false);
  const candidates = [...results, ...skipped];
  const ok = results.filter(r => r.status === 'success');
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
  return { mode: 'best', response: selected.response!, selected, candidates, fallbacks: 0, decision };
}

export function runStrategy(mode: RoutingMode, targets: RouteTarget[], request: ChatRequest, opts: StrategyOptions) {
  if (mode === 'fastest') return runFastest(targets, request, opts);
  if (mode === 'best') return runBest(targets, request, opts);
  return runSingle(targets, request, opts);
}
