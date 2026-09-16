import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashApiKey, generateApiKey, maskApiKey } from '../../crypto/encryption.js';

describe('Crypto & Key Management', () => {
  it('should encrypt and decrypt provider API keys accurately with AES-256-GCM', () => {
    const rawApiKey = 'sk-proj-test-1234567890abcdefghijklmnopqrstuvwxyz';
    const encrypted = encrypt(rawApiKey);

    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('authTag');
    expect(encrypted.ciphertext).not.toBe(rawApiKey);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(rawApiKey);
  });

  it('should generate properly formatted dvai_ API keys with hash and prefix', () => {
    const { key, prefix, hash } = generateApiKey();

    expect(key.startsWith('dvai_')).toBe(true);
    expect(key.length).toBeGreaterThan(32);
    expect(prefix).toBe(key.substring(0, 12));
    expect(hash).toBe(hashApiKey(key));
  });

  it('should mask API keys for UI presentation without exposing raw secrets', () => {
    const masked = maskApiKey('sk-ant-api03-1234567890abcdef91ab');
    expect(masked).toBe('sk-••••••91ab');
    expect(masked.includes('1234567890')).toBe(false);
  });

  it('should produce deterministic SHA-256 hashes for API key lookups', () => {
    const key = 'dvai_secret_internal_key_test';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });
});
