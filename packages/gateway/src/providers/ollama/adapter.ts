import { BaseProvider } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class OllamaProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.ollama.com/v1') {
    // Ensure baseUrl doesn't have trailing slash
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    super(id, 'ollama', name, cleanUrl);
  }

  private getV1Url(endpoint: string): string {
    if (this.baseUrl.endsWith('/v1')) {
      return `${this.baseUrl}${endpoint}`;
    }
    return `${this.baseUrl}/v1${endpoint}`;
  }

  async chat(request: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'none') {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const url = this.getV1Url('/chat/completions');
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || err.message || `Ollama Cloud error ${res.status}`);
    }

    return await res.json();
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'none') {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    // Try OpenAI-compatible /v1/models first
    try {
      const url = this.getV1Url('/models');
      const res = await this.fetchWithTimeout(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
          return data.data;
        }
      }
    } catch {
      // Fallback to native /api/tags if running Ollama proxy
    }

    // Fallback: try /api/tags
    const tagsUrl = this.baseUrl.replace(/\/v1$/, '') + '/api/tags';
    const res = await this.fetchWithTimeout(tagsUrl, { headers });
    if (!res.ok) throw new Error(`Failed to list Ollama models: ${res.status}`);
    const data = await res.json();

    return (data.models || []).map((m: any) => ({
      id: m.name || m.model,
      object: 'model' as const,
      created: Math.floor(Date.now() / 1000),
      owned_by: 'ollama-cloud'
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
