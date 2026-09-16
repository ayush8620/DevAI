import { Context, Next } from 'hono';
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    }
  } : undefined,
});

export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const requestId = c.get('requestId') || 'unknown';
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const status = c.res.status;
  const latency = Date.now() - start;

  logger.info({
    requestId,
    method,
    path,
    status,
    latency,
  }, `${method} ${path} ${status} - ${latency}ms`);
}
