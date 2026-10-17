import { BaseProvider, ChatOptions, ChatStreamChunk, ProviderHttpError } from '../base.js';
import { readSSE, throwForStatus } from '../sse.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class AnthropicProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://api.anthropic.com/v1') {
    super(id, 'anthropic', name, baseUrl);
  }

  private buildRequest(request: ChatRequest, stream: boolean) {
    const system = request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') || undefined;
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    const stop = request.stop === undefined ? undefined : Array.isArray(request.stop) ? request.stop : [request.stop];
    return {
      model: request.model, system, messages,
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature, top_p: request.top_p, stop_sequences: stop,
      ...(stream ? { stream: true } : {}),
    };
  }

  private headers(apiKey: string) {
    return { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }

  async *chatStream(request: ChatRequest, apiKey: string, options: ChatOptions = {}): AsyncGenerator<ChatStreamChunk> {
    const timeoutMs = options.timeoutMs ?? 60000;
    const res = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST', signal: options.signal, headers: this.headers(apiKey),
      body: JSON.stringify(this.buildRequest(request, true)),
    }, timeoutMs);
    await throwForStatus(res, 'Anthropic');
    let input = 0;
    let output = 0;
    for await (const data of readSSE(res, { signal: options.signal, idleTimeoutMs: timeoutMs })) {
      let ev: any;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === 'error') throw new ProviderHttpError(ev.error?.message || 'Anthropic stream error', ev.error?.type === 'overloaded_error' ? 529 : 502);
      if (ev.type === 'message_start') input = ev.message?.usage?.input_tokens || 0;
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield { delta: ev.delta.text || '' };
      else if (ev.type === 'message_delta') {
        output = ev.usage?.output_tokens ?? output;
        yield {
          delta: '',
          finishReason: ev.delta?.stop_reason === 'max_tokens' ? 'length' : 'stop',
          usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
        };
      }
    }
  }

  async chat(request: ChatRequest, apiKey: string, options: ChatOptions = {}): Promise<ChatResponse> {

    const res = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(this.buildRequest(request, false))
    }, options.timeoutMs ?? 60000);

    await throwForStatus(res, 'Anthropic');

    const data = await res.json();

    return {
      id: data.id,
      object: 'chat.completion',
      created: Date.now() / 1000 | 0,
      model: request.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') },
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
