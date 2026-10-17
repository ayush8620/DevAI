import { BaseProvider, ChatOptions, ChatStreamChunk } from '../base.js';
import { readSSE, throwForStatus, providerError } from '../sse.js';
import { ChatRequest, ChatResponse, ModelInfo } from '../../types/index.js';

export class GoogleProvider extends BaseProvider {
  constructor(id: string, name: string, baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta') {
    super(id, 'google', name, baseUrl);
  }

  /** Build the Gemini generateContent body from an OpenAI-style request. */
  buildRequest(request: ChatRequest): Record<string, unknown> {
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
    if (request.top_p !== undefined) generationConfig.topP = request.top_p;
    if (request.stop !== undefined) {
      generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }
    if (request.max_tokens !== undefined) {
      const thinking = thinkingFor(request.model);
      // max_tokens means "answer tokens": thinking must not eat that budget.
      generationConfig.maxOutputTokens = request.max_tokens + thinking.extraTokens;
      if (thinking.config) generationConfig.thinkingConfig = thinking.config;
    }

    const geminiReq: Record<string, unknown> = { contents };
    if (systemText) geminiReq.systemInstruction = { parts: [{ text: systemText }] };
    if (Object.keys(generationConfig).length) geminiReq.generationConfig = generationConfig;
    return geminiReq;
  }

  async chat(request: ChatRequest, apiKey: string, options: ChatOptions = {}): Promise<ChatResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`, {
      method: 'POST',
      signal: options.signal,
      // Send the key as a header so it never ends up in URLs/logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(this.buildRequest(request)),
    }, options.timeoutMs ?? 60000);

    await throwForStatus(res, 'Google');

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = partsText(candidate);
    const usage = toUsage(data.usageMetadata);

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now() / 1000 | 0,
      model: data.modelVersion || request.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: mapFinish(candidate?.finishReason) ?? 'stop',
      }],
      usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  async *chatStream(request: ChatRequest, apiKey: string, options: ChatOptions = {}): AsyncGenerator<ChatStreamChunk> {
    const timeoutMs = options.timeoutMs ?? 60000;
    const res = await this.fetchWithTimeout(`${this.baseUrl}/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(this.buildRequest(request)),
    }, timeoutMs);
    await throwForStatus(res, 'Google');
    for await (const data of readSSE(res, { signal: options.signal, idleTimeoutMs: timeoutMs })) {
      let json: any;
      try { json = JSON.parse(data); } catch { continue; }
      if (json.error) throw providerError(json, json.error.code || 502, 'Google');
      const candidate = json.candidates?.[0];
      yield {
        delta: partsText(candidate),
        finishReason: mapFinish(candidate?.finishReason),
        usage: toUsage(json.usageMetadata),
        model: json.modelVersion,
      };
    }
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

/**
 * Gemini 2.5+ "thinking" models count thinking tokens against maxOutputTokens, which
 * cut short answers off (e.g. max_tokens 200 → a half sentence). We keep max_tokens
 * for the visible answer:
 *  - 2.5 Flash / Flash-Lite: thinking can be turned off (budget 0).
 *  - 2.5 Pro: thinking can't be turned off; use the minimum budget (128) and add it on top.
 *  - Gemini 3+: use a low thinking level and add headroom on top.
 *  - Gemma 4: thinks but rejects thinkingConfig; add headroom on top.
 *  - Other models (Gemma 3, 1.5, 2.0, unknown): unchanged.
 */
export function thinkingFor(model: string): { config?: Record<string, unknown>; extraTokens: number } {
  const m = model.toLowerCase().replace(/^models\//, '');
  if (/gemma-[4-9]/.test(m)) return { extraTokens: 1024 };
  if (m.includes('gemma') || m.includes('tts') || m.includes('image')) return { extraTokens: 0 };
  if (/gemini-2\.5-(flash|flash-lite)(-|$)/.test(m) || m === 'gemini-flash-latest' || m === 'gemini-flash-lite-latest') {
    return { config: { thinkingBudget: 0 }, extraTokens: 0 };
  }
  if (/gemini-2\.5-pro/.test(m) || m === 'gemini-pro-latest') {
    return { config: { thinkingBudget: 128 }, extraTokens: 128 };
  }
  if (/gemini-[3-9]/.test(m)) {
    return { config: { thinkingLevel: 'low' }, extraTokens: 1024 };
  }
  return { extraTokens: 0 };
}

function partsText(candidate: any): string {
  return (candidate?.content?.parts || [])
    .filter((p: any) => typeof p.text === 'string' && !p.thought)
    .map((p: any) => p.text)
    .join('');
}

function mapFinish(reason?: string): string | null {
  if (!reason || reason === 'FINISH_REASON_UNSPECIFIED') return null;
  if (reason === 'MAX_TOKENS') return 'length';
  if (reason === 'SAFETY' || reason === 'RECITATION' || reason === 'BLOCKLIST' || reason === 'PROHIBITED_CONTENT') return 'content_filter';
  return 'stop';
}

function toUsage(u: any) {
  if (!u || u.totalTokenCount === undefined) return undefined;
  const prompt = u.promptTokenCount || 0;
  const total = u.totalTokenCount || 0;
  return { prompt_tokens: prompt, completion_tokens: Math.max(total - prompt, 0), total_tokens: total };
}
