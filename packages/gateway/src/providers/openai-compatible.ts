import { ChatRequest, ChatResponse } from '../types/index.js';
import { ChatStreamChunk } from './base.js';
import { readSSE } from './sse.js';

/** Only the OpenAI fields we support; DevAI-specific fields are never forwarded. */
export function openAIBody(request: ChatRequest, stream: boolean, includeUsage = true): Record<string, unknown> {
  const body: Record<string, unknown> = { model: request.model, messages: request.messages };
  for (const k of ['temperature', 'max_tokens', 'top_p', 'stop', 'user'] as const) {
    if (request[k] !== undefined) body[k] = request[k];
  }
  body.stream = stream;
  if (stream && includeUsage) body.stream_options = { include_usage: true };
  return body;
}

/** Parse an OpenAI-compatible chat.completion.chunk SSE stream. */
export async function* parseOpenAIStream(res: Response, opts: { signal?: AbortSignal; idleTimeoutMs?: number }): AsyncGenerator<ChatStreamChunk> {
  for await (const data of readSSE(res, opts)) {
    if (data.trim() === '[DONE]') return;
    let json: any;
    try { json = JSON.parse(data); } catch { continue; }
    if (json.error) {
      const e: any = new Error(json.error.message || 'provider stream error');
      e.status = 502;
      throw e;
    }
    const choice = json.choices?.[0];
    const usage = json.usage ?? json.x_groq?.usage;
    yield {
      delta: typeof choice?.delta?.content === 'string' ? choice.delta.content : '',
      finishReason: choice?.finish_reason ?? null,
      usage: usage ? {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      } : undefined,
      model: json.model,
    };
  }
}

export type { ChatResponse };
