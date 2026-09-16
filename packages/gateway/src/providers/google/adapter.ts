import { BaseProvider } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class GoogleProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta') {
    super(id, 'google', name, baseUrl);
  }

  async chat(request: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const contents = request.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiReq = { contents };

    const res = await this.fetchWithTimeout(`${this.baseUrl}/models/${request.model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiReq)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Google error ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now() / 1000 | 0,
      model: request.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`Failed to list Google models: ${res.status}`);
    const data = await res.json();
    return data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => ({
        id: m.name.replace('models/', ''),
        object: 'model',
        created: Date.now() / 1000 | 0,
        owned_by: 'google'
      }));
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
