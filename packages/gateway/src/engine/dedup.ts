import crypto from 'crypto';
import { ChatRequest, ChatResponse } from '../types/index.js';

export function generateCacheKey(request: ChatRequest): string {
  const data = JSON.stringify({
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Coalesce identical in-flight requests: while a request with the same key is
 * running, later callers share its result instead of calling the provider again.
 * This is per gateway instance (in memory).
 */
export async function deduplicateRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
