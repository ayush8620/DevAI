import { BaseProvider, ChatOptions, ChatStreamChunk } from '../base.js';
import { openAIBody, parseOpenAIStream } from '../openai-compatible.js';
import { throwForStatus } from '../sse.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class OpenAIProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.openai.com/v1') {
    super(id, 'openai', name, baseUrl);
  }

  async chat(request: ChatRequest, apiKey: string, options: ChatOptions = {}): Promise<ChatResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(openAIBody(request, false))
    }, options.timeoutMs ?? 60000);

    await throwForStatus(res, 'OpenAI');

    return await res.json();
  }

  async *chatStream(request: ChatRequest, apiKey: string, options: ChatOptions = {}): AsyncGenerator<ChatStreamChunk> {
    const timeoutMs = options.timeoutMs ?? 60000;
    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(openAIBody(request, true, true)),
    }, timeoutMs);
    await throwForStatus(res, 'OpenAI');
    yield* parseOpenAIStream(res, { signal: options.signal, idleTimeoutMs: timeoutMs });
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
