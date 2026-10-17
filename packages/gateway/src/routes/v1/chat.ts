import { Hono, Context } from 'hono';
import { routeRequest, RoutingError, AllProvidersFailedError } from '../../engine/router.js';
import { CandidateResult, RouteOutcome } from '../../engine/strategies.js';
import { getCachedResponse, setCachedResponse } from '../../services/cache.js';
import { recordUsage } from '../../services/usage.js';
import { consumeQuota } from '../../engine/quota.js';
import { logger } from '../../middleware/logger.js';
import { ChatRequestSchema, AppEnv } from '../../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { deduplicateRequest, generateCacheKey } from '../../engine/dedup.js';

export const chatRoutes = new Hono<AppEnv>();

const STATUS_CODE: Record<CandidateResult['status'], number> = {
  success: 200, error: 502, timeout: 504, aborted: 499, skipped: 0,
};

/** Public metadata about each provider call (no keys). */
function describeCandidate(c: CandidateResult, selected?: CandidateResult) {
  return {
    provider: c.providerName,
    provider_type: c.providerType,
    model: c.model,
    status: c.status,
    latency_ms: c.latencyMs,
    selected: c === selected || undefined,
    error: c.error,
    usage: c.response?.usage,
  };
}

/** Record one usage row per provider call, so parallel modes track every candidate's tokens. */
function recordCandidates(requestId: string, projectId: string, outcome: { candidates: CandidateResult[] }, judgeCall?: RouteOutcome['decision']) {
  for (const c of outcome.candidates) {
    if (c.status === 'skipped') continue;
    const u = c.response?.usage;
    recordUsage({
      requestId, projectId, providerId: c.providerId, credentialId: c.credentialId,
      model: c.response?.model || c.model,
      inputTokens: u?.prompt_tokens || 0, outputTokens: u?.completion_tokens || 0, totalTokens: u?.total_tokens || 0,
      latencyMs: c.latencyMs, status: STATUS_CODE[c.status], cacheHit: false, error: c.error,
    }).catch(err => logger.error({ err: err.message }, 'Failed to record usage'));
    if (u?.total_tokens) consumeQuota(c.credentialId, u.total_tokens).catch(() => {});
  }
  const j = judgeCall?.judge;
  if (j?.target) {
    const u = j.response?.usage;
    recordUsage({
      requestId, projectId, providerId: j.target.providerId, credentialId: j.target.credentialId,
      model: `${j.model} (judge)`,
      inputTokens: u?.prompt_tokens || 0, outputTokens: u?.completion_tokens || 0, totalTokens: u?.total_tokens || 0,
      latencyMs: j.latencyMs, status: j.error ? 502 : 200, cacheHit: false, error: j.error,
    }).catch(() => {});
    if (u?.total_tokens) consumeQuota(j.target.credentialId, u.total_tokens).catch(() => {});
  }
}

chatRoutes.post('/completions', async (c: Context<AppEnv>) => {
  const requestId = (c.get('requestId') as string) || `req_${uuidv4()}`;
  const projectId = (c.get('projectId') as string) || 'default';
  const project = c.get('project');
  const startTime = Date.now();

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { type: 'invalid_request', message: 'Request body must be JSON', request_id: requestId } }, 400);
  }
  const parseResult = ChatRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      error: {
        type: 'invalid_request',
        message: 'Invalid request body',
        details: parseResult.error.flatten().fieldErrors,
        request_id: requestId,
      }
    }, 400);
  }
  const request = parseResult.data;
  const headerMode = c.req.header('x-devai-mode');
  const projectRouting = project?.routing;

  // The response cache only applies to plain single-provider requests.
  const effectiveMode = request.devai?.mode ?? headerMode ?? (projectRouting as any)?.mode ?? 'single';
  const cacheable = effectiveMode === 'single' && !request.devai;

  try {
    if (cacheable) {
      const cached = await getCachedResponse(request);
      if (cached) {
        c.header('X-Cache', 'HIT');
        recordUsage({
          requestId, projectId, model: request.model,
          inputTokens: cached.usage?.prompt_tokens || 0,
          outputTokens: cached.usage?.completion_tokens || 0,
          totalTokens: cached.usage?.total_tokens || 0,
          latencyMs: Date.now() - startTime, status: 200, cacheHit: true,
        }).catch(err => logger.error({ err: err.message }, 'Failed to record cache hit usage'));
        return c.json(cached);
      }
      c.header('X-Cache', 'MISS');
    }

    // Identical concurrent requests share one routing run.
    const dedupKey = `${projectId}:${effectiveMode}:${JSON.stringify(request.devai ?? {})}:${generateCacheKey(request)}`;
    const outcome = await deduplicateRequest(dedupKey, () => routeRequest(request, projectId, { projectRouting, headerMode }));

    recordCandidates(requestId, projectId, outcome, outcome.decision);
    if (cacheable) {
      setCachedResponse(request, outcome.response).catch(err => logger.error({ err: err.message }, 'Failed to cache response'));
    }

    const sel = outcome.selected;
    c.header('x-devai-mode', outcome.mode);
    c.header('x-devai-provider', `${sel.providerName}/${sel.model}`);
    c.header('x-devai-fallbacks', String(outcome.fallbacks));

    const d = outcome.decision;
    const metadata = {
      mode: outcome.mode,
      provider: sel.providerName,
      model: sel.model,
      fallbacks: outcome.fallbacks,
      latency_ms: Date.now() - startTime,
      candidates: outcome.candidates.map(x => describeCandidate(x, sel)),
      ...(d ? {
        judge: {
          method: d.method,
          reason: d.reason,
          provider: d.judge?.provider,
          model: d.judge?.model,
          latency_ms: d.judge?.latencyMs,
          error: d.judge?.error,
        },
      } : {}),
    };

    logger.info({ requestId, projectId, mode: outcome.mode, provider: sel.providerName, model: sel.model, fallbacks: outcome.fallbacks }, 'Chat completion successful');
    return c.json({ ...outcome.response, devai: metadata });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof AllProvidersFailedError) {
      recordCandidates(requestId, projectId, { candidates: error.candidates });
      return c.json({
        error: {
          type: 'all_providers_failed',
          message: error.message,
          request_id: requestId,
          retry_after: 30,
          attempts: error.candidates.map(x => describeCandidate(x)),
        }
      }, 502);
    }

    recordUsage({
      requestId, projectId, model: request.model, latencyMs,
      status: error instanceof RoutingError ? 503 : 500, cacheHit: false, error: error.message,
    }).catch(() => {});

    if (error instanceof RoutingError) {
      logger.warn({ requestId, code: error.code, message: error.message }, 'Routing error');
      return c.json({ error: { type: error.code, message: error.message, request_id: requestId } }, 503);
    }

    logger.error({ requestId, err: error.message }, 'Chat completion error');
    return c.json({ error: { type: 'server_error', message: 'An internal server error occurred.', request_id: requestId } }, 500);
  }
});
