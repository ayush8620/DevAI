import { describe, it, expect } from 'vitest';
import { resolveCorsOrigin, parseAllowedOrigins } from '../../middleware/cors.js';

const dash = 'https://devai-dashboard-six.vercel.app';

describe('CORS origin policy', () => {
  const prod = { allowed: parseAllowedOrigins(`${dash}/, https://other.example.com`), env: 'production' };

  it('allows only configured origins in production', () => {
    expect(resolveCorsOrigin(dash, prod)).toBe(dash);
    expect(resolveCorsOrigin('https://other.example.com', prod)).toBe('https://other.example.com');
    expect(resolveCorsOrigin('https://someone-else.vercel.app', prod)).toBeNull();
    expect(resolveCorsOrigin('http://localhost:3000', prod)).toBeNull();
    expect(resolveCorsOrigin('https://evil.example.com', prod)).toBeNull();
  });

  it('allows localhost outside production', () => {
    const dev = { allowed: [], env: 'development' };
    expect(resolveCorsOrigin('http://localhost:3000', dev)).toBe('http://localhost:3000');
    expect(resolveCorsOrigin('http://127.0.0.1:3000', dev)).toBe('http://127.0.0.1:3000');
    expect(resolveCorsOrigin('http://localhost.evil.com', dev)).toBeNull();
    expect(resolveCorsOrigin('https://x.vercel.app', dev)).toBeNull();
  });

  it('"*" allows any origin; no Origin header is unaffected', () => {
    expect(resolveCorsOrigin('https://a.b', { allowed: ['*'], env: 'production' })).toBe('https://a.b');
    expect(resolveCorsOrigin(undefined, prod)).toBe('*');
  });
});
