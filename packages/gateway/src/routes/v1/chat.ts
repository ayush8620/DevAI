import { Hono, Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { routeRequest, routeStreamRequest, RoutingError, AllProvidersFailedError } from '../../engine/router.js';
import { CandidateResult, RouteOutcome, StreamOutcome, OpenStream, responseToStream } from '../../engine/strategies.js';
import { recordKeyUse } from '../../engine/key-usage.js';
import { ChatResponse, ChatUsage, ChatRequest } from '../../types/index.js';
import { getCachedResponse, setCachedResponse } from '../../services/cache.js';
import { recordUsage } from '../../services/usage.js';
import { consumeQuota } from '../../engine/quota.js';
import { logger } from '../../middleware/logger.js';
import { ChatRequestSchema, AppEnv } from '../../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { deduplicateRequest, generateCacheKey } from '../../engine/dedup.js';
import { checkKitAccess, reserveKitRequest, releaseKitRequest, addKitTokens, type KitRow } from '../../engine/kit-limits.js';

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
    key: c.keyHint,
    selected: c === selected || undefined,
    error: c.error,
    usage: c.response?.usage,
  };
}

/** Record one usage row per provider call, so parallel modes track every candidate's tokens. */
function recordCandidates(requestId: string, projectId: string, outcome: { candidates: CandidateResult[] }, judgeCall?: RouteOutcome['decision'], exclude?: CandidateResult) {
  for (const c of outcome.candidates) {
    if (c.status === 'skipped') continue;
    recordKeyUse(c.credentialId).catch(() => {});
    if (c === exclude) continue;
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
  const headerKeyStrategy = c.req.header('x-devai-key-strategy');
  const projectRouting = project?.routing;
  // Personal pool and hackathon kit projects route only over their owner's pooled keys.
  const poolOwnerUserId: string | null = project?.kind === 'pool' || project?.kind === 'kit' ? (project?.ownerUserId ?? null) : null;

  // Hackathon kit: expiry, revocation, allowed models and caps.
  const kit = c.get('kit') as KitRow | undefined;
  if (kit) {
    const access = checkKitAccess(kit, request.model);
    if (!access.ok) {
      return c.json({ error: { type: access.type, message: access.message, request_id: requestId } }, access.status);
    }
    request.model = access.model;
    const reserved = await reserveKitRequest(kit);
    if (!reserved.ok) {
      return c.json({ error: { type: reserved.type, message: reserved.message, request_id: requestId } }, reserved.status);
    }
  }

  // The response cache only applies to plain single-provider requests on shared providers
  // (pool and kit traffic is never served from, or written to, the shared cache).
  const effectiveMode = request.devai?.mode ?? headerMode ?? (projectRouting as any)?.mode ?? 'single';
  const cacheable = effectiveMode === 'single' && !request.devai && !poolOwnerUserId;

  if (request.stream) {
    return handleStream(c, request, { requestId, projectId, startTime, cacheable, projectRouting, headerMode, headerKeyStrategy, poolOwnerUserId, kit });
  }

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
    const dedupKey2 = `${dedupKey}:${headerKeyStrategy ?? ''}`;
    const outcome = await deduplicateRequest(dedupKey2, () => routeRequest(request, projectId, { projectRouting, headerMode, headerKeyStrategy, poolOwnerUserId }));

    recordCandidates(requestId, projectId, outcome, outcome.decision);
    if (kit) {
      const spent = outcome.candidates.reduce((n, x) => n + (x.response?.usage?.total_tokens || 0), 0) + (outcome.decision?.judge?.response?.usage?.total_tokens || 0);
      addKitTokens(kit, spent || outcome.response.usage?.total_tokens || 0).catch(() => {});
    }
    if (cacheable) {
      setCachedResponse(request, outcome.response).catch(err => logger.error({ err: err.message }, 'Failed to cache response'));
    }

    const sel = outcome.selected;
    setRoutingHeaders(c, outcome);

    const d = outcome.decision;
    const metadata = {
      mode: outcome.mode,
      provider: sel.providerName,
      model: sel.model,
      fallbacks: outcome.fallbacks,
      key: sel.keyHint,
      key_fallbacks: outcome.keyFallbacks,
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
    // Nothing reached a provider: give the reserved kit request back.
    if (kit && error instanceof RoutingError) releaseKitRequest(kit).catch(() => {});
    return errorResponse(c, error, request, { requestId, projectId, startTime });
  }
});

interface Ctx {
  requestId: string;
  projectId: string;
  startTime: number;
}

function setRoutingHeaders(c: Context<AppEnv>, outcome: Pick<RouteOutcome, 'mode' | 'selected' | 'fallbacks' | 'keyFallbacks'>) {
  const sel = outcome.selected;
  c.header('x-devai-mode', outcome.mode);
  c.header('x-devai-provider', `${sel.providerName}/${sel.model}`);
  c.header('x-devai-fallbacks', String(outcome.fallbacks));
  c.header('x-devai-key-fallbacks', String(outcome.keyFallbacks ?? 0));
  if (sel.keyHint) c.header('x-devai-key', asciiHeader(sel.keyName ? `${sel.keyName} (${sel.keyHint})` : sel.keyHint));
}

/** Header values must be ASCII: "AIza…DyMg" → "AIza...DyMg", other characters dropped. */
function asciiHeader(v: string) {
  return v.replace(/…/g, '...').replace(/[^\x20-\x7E]/g, '').slice(0, 120);
}

function errorResponse(c: Context<AppEnv>, error: any, request: ChatRequest, { requestId, projectId, startTime }: Ctx) {
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

/** Rough token estimate when a provider doesn't report usage for a stream. */
function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

/**
 * stream: true — OpenAI-compatible Server-Sent Events:
 *   data: {"object":"chat.completion.chunk",...}\n\n ... data: [DONE]\n\n
 * Routing/failover finishes before the first byte, so errors before that are normal JSON errors.
 * Usage is recorded when the stream ends; a complete answer is cached like a normal response.
 */
async function handleStream(
  c: Context<AppEnv>, request: ChatRequest,
  o: Ctx & { cacheable: boolean; projectRouting: unknown; headerMode?: string; headerKeyStrategy?: string; poolOwnerUserId?: string | null; kit?: KitRow },
) {
  const { requestId, projectId, startTime, cacheable } = o;
  const id = `chatcmpl-${requestId.replace(/^req_/, '').slice(0, 24) || Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const includeUsage = request.stream_options?.include_usage === true;

  let open: OpenStream;
  let outcome: StreamOutcome | null = null;
  let cachedHit = false;
  try {
    const cached = cacheable ? await getCachedResponse(request) : null;
    if (cached) {
      cachedHit = true;
      open = responseToStream(cached);
      c.header('X-Cache', 'HIT');
    } else {
      if (cacheable) c.header('X-Cache', 'MISS');
      outcome = await routeStreamRequest(request, projectId, {
        projectRouting: o.projectRouting, headerMode: o.headerMode, headerKeyStrategy: o.headerKeyStrategy,
        poolOwnerUserId: o.poolOwnerUserId,
      });
      open = outcome.stream;
      recordCandidates(requestId, projectId, outcome, outcome.decision, outcome.selected);
      setRoutingHeaders(c, outcome);
    }
  } catch (error: any) {
    if (o.kit && error instanceof RoutingError) releaseKitRequest(o.kit).catch(() => {});
    return errorResponse(c, error, request, { requestId, projectId, startTime });
  }

  const sel = outcome?.selected;
  let model = sel?.model || request.model;
  c.header('Cache-Control', 'no-cache');
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(c, async (stream) => {
    let text = '';
    let finish: string | null = null;
    let usage: ChatUsage | undefined;
    let aborted = false;
    let failed: string | undefined;
    stream.onAbort(() => { aborted = true; open.close(); });

    const chunk = (delta: Record<string, unknown>, finishReason: string | null) => JSON.stringify({
      id, object: 'chat.completion.chunk', created, model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    });

    let first = true;
    const emit = async (piece: { delta: string; finishReason?: string | null; usage?: ChatUsage; model?: string }) => {
      if (piece.model) model = piece.model;
      if (piece.usage) usage = piece.usage;
      if (piece.finishReason) finish = piece.finishReason;
      if (piece.delta || first) {
        await stream.writeSSE({ data: chunk(first ? { role: 'assistant', content: piece.delta } : { content: piece.delta }, null) });
        first = false;
        text += piece.delta;
      }
    };

    try {
      for (const piece of open.buffered) await emit(piece);
      for await (const piece of open.rest) {
        if (aborted) break;
        await emit(piece);
      }
    } catch (err: any) {
      failed = String(err?.message || err).slice(0, 300);
      if (!aborted) {
        await stream.writeSSE({ data: JSON.stringify({ error: { type: 'stream_error', message: failed, request_id: requestId } }) }).catch(() => {});
      }
    }

    if (!aborted) {
      await stream.writeSSE({ data: chunk({}, finish ?? (failed ? 'error' : 'stop')) }).catch(() => {});
      const finalUsage = usage ?? {
        prompt_tokens: estimateTokens(request.messages.map(m => m.content).join(' ')),
        completion_tokens: estimateTokens(text),
        total_tokens: 0,
      };
      if (!finalUsage.total_tokens) finalUsage.total_tokens = finalUsage.prompt_tokens + finalUsage.completion_tokens;
      usage = finalUsage;
      if (includeUsage) {
        await stream.writeSSE({ data: JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [], usage: finalUsage }) }).catch(() => {});
      }
      await stream.writeSSE({ data: '[DONE]' }).catch(() => {});
    }

    // Usage after the stream ends
    const latencyMs = Date.now() - startTime;
    const u = usage ?? { prompt_tokens: 0, completion_tokens: estimateTokens(text), total_tokens: estimateTokens(text) };
    const status = cachedHit ? 200 : aborted ? 499 : failed ? 502 : 200;
    recordUsage({
      requestId, projectId, providerId: sel?.providerId, credentialId: sel?.credentialId, model,
      inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens, totalTokens: u.total_tokens,
      latencyMs, status, cacheHit: cachedHit, error: failed ?? (aborted ? 'client disconnected' : undefined),
    }).catch(err => logger.error({ err: err.message }, 'Failed to record stream usage'));
    if (sel && u.total_tokens) consumeQuota(sel.credentialId, u.total_tokens).catch(() => {});
    if (o.kit && !cachedHit) addKitTokens(o.kit, u.total_tokens).catch(() => {});

    // Cache the assembled answer only when it finished normally
    if (cacheable && !cachedHit && !aborted && !failed && (finish ?? 'stop') === 'stop' && text.trim()) {
      const assembled: ChatResponse = {
        id, object: 'chat.completion', created, model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: u,
      };
      setCachedResponse(request, assembled).catch(() => {});
    }
    logger.info({ requestId, projectId, stream: true, provider: sel?.providerName, model, status, latencyMs }, 'Chat stream finished');
  });
}
