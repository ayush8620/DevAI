import { AIProvider } from '../providers/base.js';

export type Candidate = {
  id: string;
  provider: AIProvider;
  providerId: string;
  credentialId: string;
  decryptedKey: string;
  quotaRemaining: number;
  recentLatencyMs: number;
  errorRate: number;
  priority: number;
};

export function scoreCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (a.errorRate !== b.errorRate) return a.errorRate - b.errorRate;
    if (a.priority !== b.priority) return b.priority - a.priority; // higher priority better
    return a.recentLatencyMs - b.recentLatencyMs; // lower latency better
  });
}
