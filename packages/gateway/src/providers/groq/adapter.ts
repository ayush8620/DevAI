import { BaseProvider, ChatOptions, ProviderHttpError } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class GroqProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.groq.com/openai/v1') {
    super(id, 'groq', name, baseUrl);
  }

  async chat(request: ChatRequest, apiKey: string, options: ChatOptions = {}): Promise<ChatResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(request)
    }, options.timeoutMs ?? 60000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderHttpError(err.error?.message || `Groq error ${res.status}`, res.status);
    }

    return await res.json();
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`Failed to list Groq models: ${res.status}`);
    const data = await res.json();
    return data.data;
  }

  async healthCheck(apiKey: string): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.listModels(apiKey);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}
