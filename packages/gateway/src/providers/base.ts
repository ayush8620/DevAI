import { ChatRequest, ChatResponse, ModelInfo } from '../types/index.js';

export interface ChatOptions {
  /** Abort the upstream call (used by parallel routing to cancel slower providers). */
  signal?: AbortSignal;
  /** Per-call timeout in ms (default 60s). */
  timeoutMs?: number;
}

/** Error thrown by adapters for non-2xx upstream responses; carries the HTTP status. */
export class ProviderHttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export interface AIProvider {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  
  chat(request: ChatRequest, apiKey: string, options?: ChatOptions): Promise<ChatResponse>;
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
