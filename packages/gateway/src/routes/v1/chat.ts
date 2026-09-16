import { Hono } from 'hono';
import { routeRequest, RoutingError } from '../../engine/router.js';
import { getCachedResponse, setCachedResponse } from '../../services/cache.js';
import { recordUsage } from '../../services/usage.js';
import { logger } from '../../middleware/logger.js';
import { ChatRequestSchema, AppEnv } from '../../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.post('/completions', async (c) => {
  const requestId = (c.get('requestId') as string) || `req_${uuidv4()}`;
  const projectId = (c.get('projectId') as string) || 'default';
  const startTime = Date.now();

  try {
    // 1. Validate request body
    const body = await c.req.json();
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

    // 2. Check response cache
    const cached = await getCachedResponse(request);
    if (cached) {
      c.header('X-Cache', 'HIT');

      // Record cache hit usage
      recordUsage({
        requestId,
        projectId,
        model: request.model,
        inputTokens: cached.usage?.prompt_tokens || 0,
        outputTokens: cached.usage?.completion_tokens || 0,
        totalTokens: cached.usage?.total_tokens || 0,
        latencyMs: Date.now() - startTime,
        status: 200,
        cacheHit: true,
      }).catch(err => logger.error({ err: err.message }, 'Failed to record cache hit usage'));

      return c.json(cached);
    }

    c.header('X-Cache', 'MISS');

    // 3. Route request through engine
    const { response, provider, credential } = await routeRequest(request, projectId);

    // 4. Cache response (async, don't block)
    setCachedResponse(request, response)
      .catch(err => logger.error({ err: err.message }, 'Failed to cache response'));

    // 5. Record usage (async, don't block)
    const latencyMs = Date.now() - startTime;
    recordUsage({
      requestId,
      projectId,
      providerId: provider.id,
      credentialId: credential.id,
      model: response.model || request.model,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      latencyMs,
      status: 200,
      cacheHit: false,
    }).catch(err => logger.error({ err: err.message }, 'Failed to record usage'));

    logger.info({
      requestId,
      projectId,
      provider: provider.type,
      model: response.model,
      latencyMs,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    }, 'Chat completion successful');

    return c.json(response);

  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    // Record error usage
    recordUsage({
      requestId,
      projectId,
      model: 'unknown',
      latencyMs,
      status: error instanceof RoutingError ? 503 : 500,
      cacheHit: false,
      error: error.message,
    }).catch(() => {});

    if (error instanceof RoutingError) {
      logger.warn({ requestId, code: error.code, message: error.message }, 'Routing error');
      return c.json({
        error: {
          type: error.code,
          message: error.message,
          request_id: requestId,
          retry_after: error.code === 'all_providers_failed' ? 30 : undefined,
        }
      }, 503);
    }

    logger.error({ requestId, err: error.message }, 'Chat completion error');
    return c.json({
      error: {
        type: 'server_error',
        message: 'An internal server error occurred.',
        request_id: requestId,
      }
    }, 500);
  }
});
