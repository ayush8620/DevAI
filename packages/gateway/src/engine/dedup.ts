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

export async function deduplicateRequest(key: string, fn: () => Promise<ChatResponse>): Promise<ChatResponse> {
  // In a real system, use Redis SET NX here.
  // For now, simple pass-through.
  return await fn();
}
