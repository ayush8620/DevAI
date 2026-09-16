import { BaseProvider } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class GroqProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.groq.com/openai/v1') {
    super(id, 'groq', name, baseUrl);
  }

  async chat(request: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(request)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq error ${res.status}`);
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
