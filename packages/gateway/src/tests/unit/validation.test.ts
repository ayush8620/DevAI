import { describe, it, expect } from 'vitest';
import { ChatRequestSchema, ChatMessageSchema } from '../../types/index.js';

describe('OpenAI-compatible Request Validation', () => {
  it('should validate valid chat completion request bodies', () => {
    const valid = {
      model: 'auto',
      messages: [
        { role: 'system', content: 'You are an assistant' },
        { role: 'user', content: 'Hello' },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    };

    const parsed = ChatRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.model).toBe('auto');
      expect(parsed.data.messages.length).toBe(2);
    }
  });

  it('should reject requests missing required messages field', () => {
    const invalid = {
      model: 'gpt-4o',
    };

    const parsed = ChatRequestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('should reject invalid roles in message array', () => {
    const invalidRole = {
      role: 'invalid-role',
      content: 'Hello',
    };

    const parsed = ChatMessageSchema.safeParse(invalidRole);
    expect(parsed.success).toBe(false);
  });
});
