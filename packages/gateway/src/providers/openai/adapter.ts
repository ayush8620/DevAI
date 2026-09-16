import { BaseProvider } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class OpenAIProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.openai.com/v1') {
    super(id, 'openai', name, baseUrl);
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
      throw new Error(err.error?.message || `OpenAI error ${res.status}`);
    }

    return await res.json();
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`Failed to list OpenAI models: ${res.status}`);
    const data = await res.json();
    return data.data.filter((m: any) => m.id.includes('gpt'));
  }

  async healthCheck(apiKey: string): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.listModels(apiKey);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}
