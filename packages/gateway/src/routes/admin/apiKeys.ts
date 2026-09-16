import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { apiKeys, projects } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { generateApiKey, maskApiKey } from '../../crypto/encryption.js';
import { logAudit } from '../../services/audit.js';
import { logger } from '../../middleware/logger.js';

export const adminApiKeyRoutes = new Hono();

// List API keys for a project
adminApiKeyRoutes.get('/project/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const keys = await db.select().from(apiKeys)
      .where(eq(apiKeys.projectId, projectId));

    // Never return the hash — just metadata
    const masked = keys.map(k => ({
      id: k.id,
      projectId: k.projectId,
      name: k.name,
      keyPrefix: k.keyPrefix,
      status: k.status,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));

    return c.json({ data: masked });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to list API keys');
    return c.json({ error: { type: 'server_error', message: 'Failed to list API keys' } }, 500);
  }
});

// Generate new API key for a project
adminApiKeyRoutes.post('/project/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.json();

    if (!body.name) {
      return c.json({ error: { type: 'validation_error', message: 'name is required' } }, 400);
    }

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.status !== 'active') {
      return c.json({ error: { type: 'not_found', message: 'Project not found or inactive' } }, 404);
    }

    // Generate the API key
    const { key, prefix, hash } = generateApiKey();

    const [apiKey] = await db.insert(apiKeys).values({
      projectId,
      name: body.name,
      keyPrefix: prefix,
      keyHash: hash,
      status: 'active',
    }).returning();

    await logAudit({
      actor: 'admin',
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      details: { projectId, name: body.name },
    });

    // Return the FULL key ONLY in the creation response
    return c.json({
      data: {
        id: apiKey.id,
        key, // ⚠️ This is the ONLY time the full key is returned
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        projectId: apiKey.projectId,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
      },
      warning: 'Save this API key now. It will not be shown again.',
    }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to generate API key');
    return c.json({ error: { type: 'server_error', message: 'Failed to generate API key' } }, 500);
  }
});

// Revoke API key
adminApiKeyRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const [updated] = await db.update(apiKeys)
      .set({ status: 'revoked' })
      .where(eq(apiKeys.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: { type: 'not_found', message: 'API key not found' } }, 404);
    }

    await logAudit({
      actor: 'admin',
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: id,
    });

    return c.json({ data: { id, revoked: true } });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to revoke API key');
    return c.json({ error: { type: 'server_error', message: 'Failed to revoke API key' } }, 500);
  }
});
