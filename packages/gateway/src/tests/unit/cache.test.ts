import { describe, it, expect } from 'vitest';
import { generateCacheKey } from '../../services/cache.js';
import { ChatRequest } from '../../types/index.js';

describe('Response Cache Key Generation', () => {
  it('should generate identical SHA-256 cache keys for identical prompts and parameters', () => {
    const req1: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain binary search' }],
      temperature: 0.7,
      max_tokens: 500,
    };

    const req2: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain binary search' }],
      temperature: 0.7,
      max_tokens: 500,
    };

    const key1 = generateCacheKey(req1);
    const key2 = generateCacheKey(req2);

    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // SHA-256 hex length
  });

  it('should produce distinct cache keys when messages or parameters differ', () => {
    const req1: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain binary search' }],
      temperature: 0.7,
    };

    const req2: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain quicksort' }],
      temperature: 0.7,
    };

    const req3: ChatRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain binary search' }],
      temperature: 0.2, // different temperature
    };

    expect(generateCacheKey(req1)).not.toBe(generateCacheKey(req2));
    expect(generateCacheKey(req1)).not.toBe(generateCacheKey(req3));
  });
});
