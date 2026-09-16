import { ChatRequest, ChatResponse, ModelInfo } from '../types/index.js';

export interface AIProvider {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  
  chat(request: ChatRequest, apiKey: string): Promise<ChatResponse>;
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
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }

  abstract chat(request: ChatRequest, apiKey: string): Promise<ChatResponse>;
  abstract listModels(apiKey: string): Promise<ModelInfo[]>;
  abstract healthCheck(apiKey: string): Promise<{healthy: boolean; latencyMs: number}>;
}
