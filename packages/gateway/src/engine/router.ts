import { ChatRequest, ChatResponse } from '../types/index.js';
import { AIProvider } from '../providers/base.js';
import { createProvider } from '../providers/registry.js';
import { db } from '../db/index.js';
import { providers, providerCredentials, models } from '../db/schema/index.js';
import { decrypt } from '../crypto/encryption.js';
import { eq, and } from 'drizzle-orm';
import { withRetry } from './retry.js';
import { scoreCandidates } from './scorer.js';
import { checkQuota, consumeQuota } from './quota.js';
import { redis } from '../cache/redis.js';
import { logger } from '../middleware/logger.js';

interface ProviderCandidate {
  provider: AIProvider;
  credentialId: string;
  decryptedKey: string;
  score: number;
}

export async function routeRequest(
  request: ChatRequest,
  projectId: string
): Promise<{ provider: AIProvider; credential: { id: string }; response: ChatResponse }> {
  // 1. Fetch all enabled providers
  const allProviders = await db.select().from(providers)
    .where(eq(providers.status, 'active'));

  if (!allProviders.length) {
    throw new RoutingError('No providers configured', 'no_providers');
  }

  // 2. Fetch all enabled credentials
  const allCredentials = await db.select().from(providerCredentials)
    .where(and(
      eq(providerCredentials.enabled, true),
      eq(providerCredentials.status, 'active')
    ));

  if (!allCredentials.length) {
    throw new RoutingError('No active credentials available', 'no_credentials');
  }

  // 3. Build candidates: pair providers with their credentials
  const candidates: ProviderCandidate[] = [];

  for (const cred of allCredentials) {
    const providerDef = allProviders.find(p => p.id === cred.providerId);
    if (!providerDef) continue;

    // Check if provider supports the requested model (or model is 'auto')
    if (request.model !== 'auto' && !await isModelSupported(providerDef.type, request.model, providerDef.id)) {
      continue;
    }

    // Check rate-limit state in Redis
    const isRateLimited = await redis.get(`ratelimit:${cred.id}`);
    if (isRateLimited) continue;

    // Check health state in Redis
    const healthState = await redis.get(`health:${providerDef.id}`);
    if (healthState === 'unhealthy') continue;

    // Check quota
    const hasQuota = await checkQuota(cred.id);
    if (!hasQuota) continue;

    const decryptedKey = decrypt({
      ciphertext: cred.encryptedKey,
      iv: cred.iv,
      authTag: cred.authTag,
    });

    const provider = createProvider(
      providerDef.type,
      providerDef.id,
      providerDef.name,
      providerDef.baseUrl || undefined
    );

    candidates.push({
      provider,
      credentialId: cred.id,
      decryptedKey,
      score: 0,
    });
  }

  if (!candidates.length) {
    throw new RoutingError('No eligible providers for this request', 'no_eligible_providers');
  }

  // 4. Score and sort candidates
  const scored = scoreCandidates(candidates.map(c => ({
    id: c.credentialId,
    provider: c.provider,
    providerId: c.provider.id,
    credentialId: c.credentialId,
    decryptedKey: c.decryptedKey,
    recentLatencyMs: 0,
    errorRate: 0,
    quotaRemaining: 100,
    priority: 1,
  })));

  // 5. Try candidates in order until one succeeds
  let lastError: Error | null = null;

  for (const candidate of scored) {
    try {
      const startTime = Date.now();
      const resolvedModel = resolveModelForProvider(candidate.provider.type, request.model);
      const providerRequest: ChatRequest = {
        ...request,
        model: resolvedModel,
      };

      const response = await withRetry<ChatResponse>(
        () => candidate.provider.chat(providerRequest, candidate.decryptedKey),
        {
          maxAttempts: 2,
          onRateLimited: async () => {
            // Mark this credential as rate-limited in Redis (60s TTL)
            await redis.set(`ratelimit:${candidate.credentialId}`, '1', 'EX', 60);
          },
        }
      );

      const latencyMs = Date.now() - startTime;

      // Store latency for future scoring
      await redis.set(`latency:${candidate.credentialId}`, String(latencyMs), 'EX', 300);

      // Consume quota
      if (response.usage) {
        await consumeQuota(candidate.credentialId, response.usage.total_tokens);
      }

      return {
        provider: candidate.provider,
        credential: { id: candidate.credentialId },
        response,
      };
    } catch (err: any) {
      lastError = err;
      logger.warn({
        providerId: candidate.provider.id,
        credentialId: candidate.credentialId,
        error: err.message,
      }, 'Provider attempt failed, trying next candidate');
      continue;
    }
  }

  throw lastError || new RoutingError('All providers failed', 'all_providers_failed');
}

function resolveModelForProvider(providerType: string, requestedModel: string): string {
  if (requestedModel && requestedModel !== 'auto') {
    return requestedModel;
  }
  const defaultModels: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    google: 'gemini-1.5-flash',
    groq: 'llama-3.1-8b-instant',
    ollama: 'gpt-oss:120b',
  };
  return defaultModels[providerType] || 'gpt-4o-mini';
}

async function isModelSupported(providerType: string, modelId: string, providerId?: string): Promise<boolean> {
  // 1. Check if user configured this model explicitly in the DB for this provider
  if (providerId) {
    try {
      const dbModels = await db.select().from(models)
        .where(and(
          eq(models.providerId, providerId),
          eq(models.enabled, true)
        ));
      if (dbModels.some(m => m.modelId.toLowerCase() === modelId.toLowerCase() || modelId.toLowerCase().includes(m.modelId.toLowerCase()))) {
        return true;
      }
    } catch {
      // Fall through to defaults
    }
  }

  // 2. Default provider models fallback
  const modelMap: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
    anthropic: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-4-sonnet', 'claude-4-opus'],
    google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-pro'],
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
