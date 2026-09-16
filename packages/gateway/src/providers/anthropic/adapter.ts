import { BaseProvider } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class AnthropicProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.anthropic.com/v1') {
    super(id, 'anthropic', name, baseUrl);
  }

  async chat(request: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const system = systemMessages.length > 0 ? systemMessages[0].content : undefined;
    
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

    const anthropicReq = {
      model: request.model,
      system,
      messages,
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature,
      top_p: request.top_p,
    };

    const res = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicReq)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error ${res.status}`);
    }

    const data = await res.json();

    return {
      id: data.id,
      object: 'chat.completion',
      created: Date.now() / 1000 | 0,
      model: request.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: data.content[0].text },
        finish_reason: data.stop_reason === 'max_tokens' ? 'length' : 'stop'
      }],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens
      }
    };
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const models = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307', 'claude-4-sonnet', 'claude-4-opus'];
    return models.map(id => ({
      id,
      object: 'model',
      created: Date.now() / 1000 | 0,
      owned_by: 'anthropic'
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
