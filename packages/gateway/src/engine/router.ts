import { ChatRequest, RoutingConfig, RoutingConfigSchema, RoutingMode, ROUTING_MODES, TargetSpec } from '../types/index.js';
import { createProvider } from '../providers/registry.js';
import { db } from '../db/index.js';
import { providers, providerCredentials, models } from '../db/schema/index.js';
import { decrypt } from '../crypto/encryption.js';
import { eq, and } from 'drizzle-orm';
import { scoreCandidates } from './scorer.js';
import { checkQuota } from './quota.js';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { circuitStore } from './circuit.js';
import { logger } from '../middleware/logger.js';
import {
  RouteTarget, RouteOutcome, CandidateResult, Judge, AllProvidersFailedError, runStrategy,
} from './strategies.js';

export { AllProvidersFailedError } from './strategies.js';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_PARALLEL = 5;

export interface ResolvedRouting {
  mode: RoutingMode;
  providers?: TargetSpec[];
  judge?: TargetSpec;
  timeoutMs: number;
}

/** Precedence: request body `devai` > `x-devai-mode` header > project defaults > single. */
export function resolveRouting(request: ChatRequest, projectRouting: unknown, headerMode?: string | null): ResolvedRouting {
  const parsed = RoutingConfigSchema.safeParse(projectRouting ?? {});
  const project: RoutingConfig = parsed.success ? parsed.data : {};
  const req = request.devai ?? {};
  const header = headerMode && (ROUTING_MODES as readonly string[]).includes(headerMode) ? (headerMode as RoutingMode) : undefined;
  return {
    mode: req.mode ?? header ?? project.mode ?? 'single',
    providers: req.providers ?? project.providers,
    judge: req.judge ?? project.judge,
    timeoutMs: req.timeoutMs ?? project.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function parseSpec(spec: TargetSpec): { provider: string; model?: string } {
  if (typeof spec !== 'string') return spec;
  const i = spec.indexOf(':');
  return i === -1 ? { provider: spec } : { provider: spec.slice(0, i), model: spec.slice(i + 1) || undefined };
}

type ProviderRow = typeof providers.$inferSelect;
type CredentialRow = typeof providerCredentials.$inferSelect;

async function loadPool() {
  const allProviders = await db.select().from(providers).where(eq(providers.status, 'active'));
  const allCredentials = await db.select().from(providerCredentials)
    .where(and(eq(providerCredentials.enabled, true), eq(providerCredentials.status, 'active')));
  return { allProviders, allCredentials };
}

function matchProvider(all: ProviderRow[], ref: string): ProviderRow[] {
  const r = ref.toLowerCase();
  const byId = all.filter(p => p.id === ref);
  if (byId.length) return byId;
  const byName = all.filter(p => p.name.toLowerCase() === r);
  if (byName.length) return byName;
  return all.filter(p => p.type.toLowerCase() === r);
}

/**
 * Turn provider rows + credentials into targets, dropping credentials that are
 * rate-limited, out of quota, or whose provider failed its last health check.
 */
async function toTargets(pairs: { p: ProviderRow; model: string }[], creds: CredentialRow[], skipped: CandidateResult[]): Promise<RouteTarget[]> {
  const out: RouteTarget[] = [];
  for (const { p, model } of pairs) {
    const health = await cacheGet(`health:${p.id}`);
    for (const cred of creds.filter(c => c.providerId === p.id)) {
      const info = { providerId: p.id, providerName: p.name, providerType: p.type, credentialId: cred.id, model, latencyMs: 0 };
      if (health === 'unhealthy') { skipped.push({ ...info, status: 'skipped', error: 'provider marked unhealthy by health check' }); continue; }
      if (await cacheGet(`ratelimit:${cred.id}`)) { skipped.push({ ...info, status: 'skipped', error: 'rate limited (cooling down)' }); continue; }
      if (!(await checkQuota(cred.id))) { skipped.push({ ...info, status: 'skipped', error: 'quota exhausted' }); continue; }
      out.push({
        provider: createProvider(p.type, p.id, p.name, p.baseUrl || undefined),
        providerId: p.id,
        providerName: p.name,
        credentialId: cred.id,
        apiKey: decrypt({ ciphertext: cred.encryptedKey, iv: cred.iv, authTag: cred.authTag }),
        model,
      });
    }
  }
  return out;
}

export async function buildTargets(request: ChatRequest, routing: ResolvedRouting) {
  const { allProviders, allCredentials } = await loadPool();
  if (!allProviders.length) throw new RoutingError('No providers configured', 'no_providers');
  if (!allCredentials.length) throw new RoutingError('No active credentials available', 'no_credentials');
  const skipped: CandidateResult[] = [];

  // Explicit priority list (from the request or the app's settings)
  if (routing.providers?.length) {
    const pairs: { p: ProviderRow; model: string }[] = [];
    for (const spec of routing.providers) {
      const { provider, model } = parseSpec(spec);
      for (const p of matchProvider(allProviders, provider)) {
        pairs.push({ p, model: model ?? (request.model !== 'auto' ? request.model : resolveModelForProvider(p.type, 'auto')) });
      }
    }
    if (!pairs.length) throw new RoutingError('None of the requested providers exist or are active', 'no_eligible_providers');
    return { targets: await toTargets(pairs, allCredentials, skipped), skipped };
  }

  // Automatic: every provider that supports the model, ordered by configured priority then recent latency
  const pairs: { p: ProviderRow; model: string }[] = [];
  for (const p of allProviders) {
    if (request.model !== 'auto' && !(await isModelSupported(p.type, request.model, p.id))) continue;
    pairs.push({ p, model: resolveModelForProvider(p.type, request.model) });
  }
  const targets = await toTargets(pairs, allCredentials, skipped);
  const scored = scoreCandidates(await Promise.all(targets.map(async t => {
    const p = allProviders.find(x => x.id === t.providerId)!;
    const priority = Number((p.config as any)?.priority ?? 0) || 0;
    const latency = Number(await cacheGet(`latency:${t.credentialId}`)) || 0;
    return {
      id: t.credentialId, provider: t.provider, providerId: t.providerId, credentialId: t.credentialId,
      decryptedKey: t.apiKey, quotaRemaining: 100, recentLatencyMs: latency, errorRate: 0, priority,
    };
  })));
  return { targets: scored.map(s => targets.find(t => t.credentialId === s.credentialId && t.providerId === s.providerId)!), skipped };
}

const JUDGE_SYSTEM = 'You are an impartial judge. Compare the candidate answers to the user request and pick the most accurate, complete and helpful one. Reply with JSON only, no markdown: {"best": <candidate number>, "reason": "<one short sentence>"}';

/** Build an LLM judge that runs on the given target. */
export function makeLlmJudge(target: RouteTarget, timeoutMs: number): Judge {
  return async (request, candidates) => {
    const convo = request.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n').slice(-6000);
    const answers = candidates.map((c, i) => `[${i + 1}]\n${c.response!.choices[0].message.content.slice(0, 4000)}`).join('\n\n');
    const start = Date.now();
    const judgeInfo = { provider: target.providerName, model: target.model, target };
    try {
      const response = await target.provider.chat({
        model: target.model,
        temperature: 0,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM },
          { role: 'user', content: `Conversation:\n${convo}\n\nCandidate answers:\n${answers}` },
        ],
      }, target.apiKey, { timeoutMs });
      const text = response.choices[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('judge did not return JSON');
      const parsed = JSON.parse(match[0]);
      const index = Number(parsed.best) - 1;
      if (!(index >= 0 && index < candidates.length)) throw new Error(`judge picked invalid candidate ${parsed.best}`);
      return { index, method: 'judge', reason: String(parsed.reason || '').slice(0, 500), judge: { ...judgeInfo, latencyMs: Date.now() - start, response } };
    } catch (err: any) {
      // Strategy falls back to the heuristic; keep judge details for metadata
      const e: any = new Error(`judge failed: ${err.message}`);
      e.judge = { ...judgeInfo, latencyMs: Date.now() - start, error: err.message };
      throw e;
    }
  };
}

export async function routeRequest(
  request: ChatRequest,
  projectId: string,
  options: { projectRouting?: unknown; headerMode?: string | null } = {},
): Promise<RouteOutcome & { routing: ResolvedRouting }> {
  const routing = resolveRouting(request, options.projectRouting, options.headerMode);
  let { targets, skipped } = await buildTargets(request, routing);
  if (routing.mode !== 'single') targets = dedupeTargets(targets).slice(0, MAX_PARALLEL);

  let judge: Judge | undefined;
  if (routing.mode === 'best' && targets.length > 1) {
    let judgeTarget = targets[0];
    if (routing.judge) {
      const { targets: jt } = await buildTargets({ ...request, model: 'auto' }, { ...routing, providers: [routing.judge] });
      if (jt[0]) judgeTarget = jt[0];
    }
    judge = makeLlmJudge(judgeTarget, routing.timeoutMs);
  }

  try {
    const outcome = await runStrategy(routing.mode, targets, request, {
      circuit: circuitStore,
      timeoutMs: routing.timeoutMs,
      overallTimeoutMs: routing.timeoutMs + 5000,
      judge,
      onRateLimited: (t) => cacheSet(`ratelimit:${t.credentialId}`, '1', 60),
    });
    outcome.candidates.push(...skipped);
    cacheSet(`latency:${outcome.selected.credentialId}`, String(outcome.selected.latencyMs), 300).catch(() => {});
    return { ...outcome, routing };
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      err.candidates.push(...skipped);
      logger.warn({ projectId, mode: routing.mode, attempts: err.candidates.length }, 'All providers failed');
    }
    throw err;
  }
}

function dedupeTargets(targets: RouteTarget[]): RouteTarget[] {
  const seen = new Set<string>();
  return targets.filter(t => {
    const k = `${t.providerId}:${t.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function resolveModelForProvider(providerType: string, requestedModel: string): string {
  if (requestedModel && requestedModel !== 'auto') return requestedModel;
  const defaultModels: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    google: 'gemini-2.5-flash',
    groq: 'llama-3.1-8b-instant',
    ollama: 'gpt-oss:120b',
  };
  return defaultModels[providerType] || 'gpt-4o-mini';
}

async function isModelSupported(providerType: string, modelId: string, providerId?: string): Promise<boolean> {
  if (providerId) {
    try {
      const dbModels = await db.select().from(models)
        .where(and(eq(models.providerId, providerId), eq(models.enabled, true)));
      if (dbModels.some(m => m.modelId.toLowerCase() === modelId.toLowerCase() || modelId.toLowerCase().includes(m.modelId.toLowerCase()))) {
        return true;
      }
    } catch {
      // Fall through to defaults
    }
  }
  const modelMap: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
    anthropic: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-4-sonnet', 'claude-4-opus'],
    google: ['gemini', 'gemma'],
    groq: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    ollama: ['llama3', 'llama', 'mistral', 'deepseek', 'qwen', 'phi', 'gemma', 'codellama', 'starcoder', 'vicuna', 'gpt-oss'],
  };
  const supported = modelMap[providerType] || [];
  return supported.some(m => modelId.includes(m) || m.includes(modelId));
}

export class RoutingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'RoutingError';
  }
}
