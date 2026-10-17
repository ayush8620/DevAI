import { BaseProvider, ChatOptions, ChatStreamChunk } from '../base.js';
import { openAIBody, parseOpenAIStream } from '../openai-compatible.js';
import { throwForStatus } from '../sse.js';
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
      body: JSON.stringify(openAIBody(request, false))
    }, options.timeoutMs ?? 60000);

    await throwForStatus(res, 'Groq');

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
    await throwForStatus(res, 'Groq');
    yield* parseOpenAIStream(res, { signal: options.signal, idleTimeoutMs: timeoutMs });
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
