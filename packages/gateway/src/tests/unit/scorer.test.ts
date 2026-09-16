import { describe, it, expect } from 'vitest';
import { scoreCandidates, Candidate } from '../../engine/scorer.js';

describe('Candidate Scoring & Prioritization', () => {
  it('should rank healthy and lower latency candidates ahead of degraded ones', () => {
    const mockProvider = { id: 'p1', type: 'openai', name: 'OpenAI', baseUrl: '' } as any;

    const candidates: Candidate[] = [
      {
        id: 'c1',
        provider: mockProvider,
        providerId: 'p1',
        credentialId: 'cred-1',
        decryptedKey: 'k1',
        quotaRemaining: 100,
        recentLatencyMs: 850,
        errorRate: 0.05,
        priority: 1,
      },
      {
        id: 'c2',
        provider: mockProvider,
        providerId: 'p1',
        credentialId: 'cred-2',
        decryptedKey: 'k2',
        quotaRemaining: 100,
        recentLatencyMs: 320,
        errorRate: 0.0,
        priority: 1,
      },
      {
        id: 'c3',
        provider: mockProvider,
        providerId: 'p1',
        credentialId: 'cred-3',
        decryptedKey: 'k3',
        quotaRemaining: 50,
        recentLatencyMs: 150,
        errorRate: 0.2,
        priority: 2,
      },
    ];

    const sorted = scoreCandidates(candidates);

    // c2 has errorRate 0.0, should be first
    expect(sorted[0].id).toBe('c2');
    // c1 has errorRate 0.05, should be second
    expect(sorted[1].id).toBe('c1');
    // c3 has errorRate 0.2, should be last despite lower latency
    expect(sorted[2].id).toBe('c3');
  });

  it('should sort by priority when error rates are equal', () => {
    const mockProvider = { id: 'p1', type: 'openai', name: 'OpenAI', baseUrl: '' } as any;

    const candidates: Candidate[] = [
      {
        id: 'low-pri',
        provider: mockProvider,
        providerId: 'p1',
        credentialId: 'cred-1',
        decryptedKey: 'k1',
        quotaRemaining: 100,
        recentLatencyMs: 200,
        errorRate: 0,
        priority: 1,
      },
      {
        id: 'high-pri',
        provider: mockProvider,
        providerId: 'p1',
        credentialId: 'cred-2',
        decryptedKey: 'k2',
        quotaRemaining: 100,
        recentLatencyMs: 200,
        errorRate: 0,
        priority: 5,
      },
    ];

    const sorted = scoreCandidates(candidates);
    expect(sorted[0].id).toBe('high-pri');
  });
});
