import { BaseProvider, ChatOptions, ProviderHttpError } from '../base.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class GoogleProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta') {
    super(id, 'google', name, baseUrl);
  }

  async chat(request: ChatRequest, apiKey: string, options: ChatOptions = {}): Promise<ChatResponse> {
    // Gemini has no "system" role: send system messages as systemInstruction.
    const systemText = request.messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n');

    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.max_tokens !== undefined) generationConfig.maxOutputTokens = request.max_tokens;
    if (request.top_p !== undefined) generationConfig.topP = request.top_p;
    if (request.stop !== undefined) {
      generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    const geminiReq: Record<string, unknown> = { contents };
    if (systemText) geminiReq.systemInstruction = { parts: [{ text: systemText }] };
    if (Object.keys(generationConfig).length) geminiReq.generationConfig = generationConfig;

    const res = await this.fetchWithTimeout(`${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`, {
      method: 'POST',
      signal: options.signal,
      // Send the key as a header so it never ends up in URLs/logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(geminiReq),
    }, options.timeoutMs ?? 60000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderHttpError(err.error?.message || `Google error ${res.status}`, res.status);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .filter((p: any) => typeof p.text === 'string' && !p.thought)
      .map((p: any) => p.text)
      .join('');
    const usage = data.usageMetadata || {};
    const promptTokens = usage.promptTokenCount || 0;
    const totalTokens = usage.totalTokenCount || 0;

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now() / 1000 | 0,
      model: data.modelVersion || request.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: Math.max(totalTokens - promptTokens, 0),
        total_tokens: totalTokens,
      },
    };
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': apiKey },
    });
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
