import { Context, Next } from 'hono';
import { v4 as uuidv4 } from 'uuid';

export async function requestIdMiddleware(c: Context, next: Next) {
  const reqId = `req_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
  c.set('requestId', reqId);
  c.res.headers.set('X-Request-ID', reqId);
  await next();
}
