import { AIProvider } from './base.js';
import { OpenAIProvider } from './openai/adapter.js';
import { AnthropicProvider } from './anthropic/adapter.js';
import { GoogleProvider } from './google/adapter.js';
import { GroqProvider } from './groq/adapter.js';
import { OllamaProvider } from './ollama/adapter.js';

const providerConstructors: Record<string, new (id: string, name: string, baseUrl?: string) => AIProvider> = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  google: GoogleProvider,
  groq: GroqProvider,
  ollama: OllamaProvider,
};

export function createProvider(type: string, id: string, name: string, baseUrl?: string): AIProvider {
  const Constructor = providerConstructors[type.toLowerCase()];
  if (!Constructor) throw new Error(`Unsupported provider type: ${type}`);
  return new Constructor(id, name, baseUrl);
}

export function getSupportedProviderTypes(): string[] {
  return Object.keys(providerConstructors);
}
