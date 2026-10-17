import { ChatRequest, ChatResponse, ChatUsage, ModelInfo } from '../types/index.js';

export interface ChatOptions {
  /** Abort the upstream call (used by parallel routing to cancel slower providers). */
  signal?: AbortSignal;
  /** Per-call timeout in ms (default 60s). */
  timeoutMs?: number;
}

/** One incremental piece of a streamed completion, normalised across providers. */
export interface ChatStreamChunk {
  /** New text (may be empty for role/usage-only chunks) */
  delta: string;
  /** OpenAI-style finish reason once the provider reports one ('stop' | 'length' | ...) */
  finishReason?: string | null;
  /** Token usage, usually only on the last chunk */
  usage?: ChatUsage;
  /** Concrete model reported by the provider */
  model?: string;
}

/** Error thrown by adapters for non-2xx upstream responses; carries the HTTP status. */
export class ProviderHttpError extends Error {
  /** Seconds the provider asked us to wait (Retry-After header or Google RetryInfo) */
  retryAfterSec?: number;
  /** 'model' when the provider says the limit applies to one model only (Google per-model quotas) */
  limitScope?: 'model' | 'key';
  constructor(message: string, public status: number, extra: { retryAfterSec?: number; limitScope?: 'model' | 'key' } = {}) {
    super(message);
    this.name = 'ProviderHttpError';
    this.retryAfterSec = extra.retryAfterSec;
    this.limitScope = extra.limitScope;
  }
}

export interface AIProvider {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  
  chat(request: ChatRequest, apiKey: string, options?: ChatOptions): Promise<ChatResponse>;
  /** Native streaming. Adapters without it are streamed by DevAI as one chunk. */
  chatStream?(request: ChatRequest, apiKey: string, options?: ChatOptions): AsyncGenerator<ChatStreamChunk>;
  listModels(apiKey: string): Promise<ModelInfo[]>;
  healthCheck(apiKey: string): Promise<{healthy: boolean; latencyMs: number}>;
}

export abstract class BaseProvider implements AIProvider {
  constructor(
    public id: string,
    public type: string,
    public name: string,
    public baseUrl: string
  ) {}

  protected async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    // Also abort when the caller's signal fires (e.g. another provider already won).
    const outer = options.signal;
    const onAbort = () => controller.abort(outer?.reason ?? new Error('aborted'));
    if (outer) {
      if (outer.aborted) onAbort();
      else outer.addEventListener('abort', onAbort, { once: true });
    }
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error: any) {
      if (controller.signal.aborted && !outer?.aborted) {
        const e: any = new Error(`timeout after ${timeoutMs}ms`);
        e.name = 'TimeoutError';
        throw e;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }

  abstract chat(request: ChatRequest, apiKey: string, options?: ChatOptions): Promise<ChatResponse>;
  abstract listModels(apiKey: string): Promise<ModelInfo[]>;
  abstract healthCheck(apiKey: string): Promise<{healthy: boolean; latencyMs: number}>;
}
