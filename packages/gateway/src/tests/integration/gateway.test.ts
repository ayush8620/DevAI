import { describe, it, expect } from 'vitest';
import { app } from '../../app.js';
import { config } from '../../config.js';

describe('DevAI Gateway HTTP API Integration', () => {
  it('GET /v1/health should be publicly accessible without authentication', async () => {
    const res = await app.request('/v1/health', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('redis');
    expect(body).toHaveProperty('database');
  }, 15000);

  it('POST /v1/chat/completions should return 401 Unauthorized when no auth header is provided', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'auto',
        messages: [{ role: 'user', content: 'test' }],
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.type).toBe('authentication_error');
  });

  it('GET /admin/providers should return 401 Unauthorized when using invalid admin key', async () => {
    const res = await app.request('/admin/providers', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid_admin_token' },
    });

    expect(res.status).toBe(401);
  });

  it('GET /admin/providers should succeed with valid ADMIN_API_KEY', async () => {
    const res = await app.request('/admin/providers', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.ADMIN_API_KEY}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /admin/analytics/overview should return system overview metrics', async () => {
    const res = await app.request('/admin/analytics/overview', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.ADMIN_API_KEY}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('requestsToday');
    expect(body.data).toHaveProperty('tokensToday');
    expect(body.data).toHaveProperty('cacheHitRate');
  });

  it('should return standardized 404 for unknown endpoints', async () => {
    const res = await app.request('/unknown/endpoint', {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.type).toBe('not_found');
  });
});
