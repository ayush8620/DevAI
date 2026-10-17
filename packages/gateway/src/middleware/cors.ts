import { cors } from 'hono/cors';
import { config } from '../config.js';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Decide the Access-Control-Allow-Origin value for a request origin.
 *  - Only origins listed in ALLOWED_ORIGINS are allowed ("*" allows any).
 *  - Outside production, http(s)://localhost and 127.0.0.1 are allowed for local development.
 *  - Requests without an Origin header (server-to-server, curl) are not affected by CORS.
 */
export function resolveCorsOrigin(origin: string | undefined, opts: { allowed: string[]; env: string }): string | null {
  if (!origin) return '*';
  const normalized = origin.replace(/\/+$/, '');
  if (opts.allowed.includes('*')) return origin;
  if (opts.allowed.includes(normalized)) return origin;
  if (opts.env !== 'production') {
    try {
      const u = new URL(origin);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return origin;
    } catch { /* invalid origin */ }
  }
  return null;
}

const allowedOrigins = parseAllowedOrigins(config.ALLOWED_ORIGINS);

export const corsMiddleware = cors({
  origin: (origin) => resolveCorsOrigin(origin, { allowed: allowedOrigins, env: config.NODE_ENV }),
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-DevAI-Mode', 'X-DevAI-Key-Strategy'],
  exposeHeaders: ['X-Request-ID', 'X-Cache', 'X-DevAI-Mode', 'X-DevAI-Provider', 'X-DevAI-Fallbacks', 'X-DevAI-Key', 'X-DevAI-Key-Fallbacks'],
  maxAge: 86400,
});
