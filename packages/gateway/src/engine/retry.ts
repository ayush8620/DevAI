import { logger } from '../middleware/logger.js';

export type RetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  onRateLimited?: () => Promise<void>;
};

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  let delay = options?.initialDelayMs ?? 1000;
  const backoffFactor = options?.backoffFactor ?? 2;
  const maxDelay = options?.maxDelayMs ?? 30000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const statusCode = extractStatusCode(err);
      const isRateLimit = statusCode === 429;
      const isServerError = statusCode !== null && statusCode >= 500;
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');

      // On rate limit, call the callback and throw immediately (let router try next candidate)
      if (isRateLimit) {
        if (options?.onRateLimited) {
          await options.onRateLimited();
        }
        throw err;
      }

      // Don't retry client errors (4xx except 429)
      if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
        throw err;
      }

      // Last attempt — throw
      if (attempt === maxAttempts) {
        throw err;
      }

      // Retry on server errors and timeouts
      if (isServerError || isTimeout) {
        // Add jitter: delay * (0.5 to 1.5)
        const jitter = delay * (0.5 + Math.random());
        const actualDelay = Math.min(jitter, maxDelay);

        logger.warn({
          attempt,
          maxAttempts,
          delayMs: Math.round(actualDelay),
          statusCode,
          error: err.message,
        }, 'Retrying after error');

        await new Promise(res => setTimeout(res, actualDelay));
        delay *= backoffFactor;
        continue;
      }

      // Unknown error — throw
      throw err;
    }
  }

  throw new Error('Retry exhausted');
}

function extractStatusCode(err: any): number | null {
  // Check common patterns for status codes in errors
  if (err.statusCode) return err.statusCode;
  if (err.status) return err.status;

  const match = err.message?.match(/(\d{3})/);
  if (match) {
    const code = parseInt(match[1], 10);
    if (code >= 400 && code < 600) return code;
  }

  return null;
}
