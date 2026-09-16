import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../engine/retry.js';

describe('Retry Engine & Backoff', () => {
  it('should succeed on first attempt if fn resolves without error', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 500 server error and eventually succeed', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        throw new Error('500 Internal Server Error');
      }
      return 'recovered';
    });

    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should trigger onRateLimited callback and fail fast on 429 rate limit', async () => {
    const onRateLimited = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(withRetry(fn, { maxAttempts: 3, onRateLimited })).rejects.toThrow('429');
    expect(fn).toHaveBeenCalledTimes(1); // Fails immediately to let router rotate to another credential
    expect(onRateLimited).toHaveBeenCalledTimes(1);
  });

  it('should not retry on client errors like 400 Bad Request', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('400 Invalid Prompt'));

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('400 Invalid Prompt');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
