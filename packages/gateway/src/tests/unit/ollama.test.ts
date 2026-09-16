import { describe, it, expect, vi } from 'vitest';
import { OllamaProvider } from '../../providers/ollama/adapter.js';
import { createProvider, getSupportedProviderTypes } from '../../providers/registry.js';

describe('Ollama Cloud Provider Adapter', () => {
  it('should be registered in provider registry', () => {
    const types = getSupportedProviderTypes();
    expect(types).toContain('ollama');

    const provider = createProvider('ollama', 'p-ollama-1', 'Ollama Cloud', 'https://api.ollama.com/v1');
    expect(provider.type).toBe('ollama');
    expect(provider.name).toBe('Ollama Cloud');
  });

  it('should send OpenAI-compatible chat request to /v1/chat/completions', async () => {
    const provider = new OllamaProvider('p1', 'Ollama Cloud', 'https://ollama.my-cloud.io');

    const mockResponse = {
      id: 'chatcmpl-ollama-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama3:latest',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello from Ollama Cloud!' },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
    };

    // Mock fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const res = await provider.chat(
      { model: 'llama3:latest', messages: [{ role: 'user', content: 'hi' }] },
      'ollama_secret_cloud_key'
    );

    expect(res.choices[0].message.content).toBe('Hello from Ollama Cloud!');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://ollama.my-cloud.io/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer ollama_secret_cloud_key'
        })
      })
    );

    fetchSpy.mockRestore();
  });
});
