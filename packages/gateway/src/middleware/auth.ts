import { Context, Next } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashApiKey } from '../crypto/encryption.js';
import '../config.js'; // loads .env before the admin auth settings are read
import { logger } from './logger.js';
import { authenticateAdmin } from '../auth/admin.js';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: { type: 'authentication_error', message: 'Missing or invalid Authorization header' } }, 401);
  }

  const token = authHeader.slice(7).trim();
  const path = c.req.path;
  
  if (path.startsWith('/admin')) {
    // ADMIN_API_KEY, or a Clerk session token of an allowlisted user.
    const result = await authenticateAdmin(token);
    if (!result.ok) {
      const type = result.status === 403 ? 'permission_error' : 'authentication_error';
      return c.json({ error: { type, message: result.message } }, result.status);
    }
    c.set('adminAuth', result);
    return await next();
  } else if (path.startsWith('/v1')) {
    const keyHash = hashApiKey(token);
    const keyPrefix = token.substring(0, 12);
    
    try {
      const [apiKeyResult] = await db.select().from(schema.apiKeys)
        .where(and(
          eq(schema.apiKeys.keyPrefix, keyPrefix),
          eq(schema.apiKeys.keyHash, keyHash),
          eq(schema.apiKeys.status, 'active')
        ))
        .limit(1);

      if (!apiKeyResult) {
        return c.json({ error: { type: 'authentication_error', message: 'Invalid API key' } }, 401);
      }
      
      const [projectResult] = await db.select().from(schema.projects)
        .where(eq(schema.projects.id, apiKeyResult.projectId))
        .limit(1);
      
      if (!projectResult || projectResult.status !== 'active') {
        return c.json({ error: { type: 'authentication_error', message: 'Project is inactive or not found' } }, 401);
      }

      // Update lastUsedAt asynchronously (non-blocking)
      db.update(schema.apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.apiKeys.id, apiKeyResult.id))
        .catch(() => {});

      c.set('projectId', projectResult.id);
      c.set('project', projectResult);
      
      return await next();
    } catch (err: any) {
      logger.error({ err: err?.message || err }, 'Error during API key validation');
      return c.json({ error: { type: 'server_error', message: 'Internal server error during authentication' } }, 500);
    }
  }

  return await next();
}
