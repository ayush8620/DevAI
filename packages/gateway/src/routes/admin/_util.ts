import type { Context } from 'hono';
import { logger } from '../../middleware/logger.js';

/** Shared bits of the admin panel routes. */
export const DAY_MS = 86_400_000;

export type Period = 'today' | 'week' | 'month';
export function parsePeriod(v: string | undefined, def: Period = 'week'): Period {
  return v === 'today' || v === 'week' || v === 'month' ? v : def;
}
export function periodStart(p: Period, now: Date = new Date()): Date {
  if (p === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(now.getTime() - (p === 'week' ? 7 : 30) * DAY_MS);
}

export function fail(c: Context, status: 400 | 404 | 409 | 500 | 503, type: string, message: string) {
  return c.json({ error: { type, message } }, status);
}

/** Log and answer 500 (no internals leak to the browser). */
export function serverError(c: Context, err: any, what: string) {
  logger.error({ err: err?.message ?? String(err) }, `Admin: ${what} failed`);
  return fail(c, 500, 'server_error', `Could not ${what}`);
}

/** Client IP for the audit log (Render / Vercel put it in x-forwarded-for). */
export function clientIp(c: Context): string | undefined {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || undefined;
}
