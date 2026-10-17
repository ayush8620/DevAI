import { describe, it, expect } from 'vitest';
import { deduplicateRequest } from '../../engine/dedup.js';

describe('deduplicateRequest', () => {
  it('shares one call between concurrent identical requests', async () => {
    let calls = 0;
    const fn = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return 'ok'; };
    const [a, b] = await Promise.all([deduplicateRequest('k', fn), deduplicateRequest('k', fn)]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(calls).toBe(1);
  });

  it('runs again once the first request finished', async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await deduplicateRequest('k2', fn);
    await deduplicateRequest('k2', fn);
    expect(calls).toBe(2);
  });
});
