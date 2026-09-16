import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { providers, providerCredentials, models } from '../../db/schema/index.js';
import { eq, and, sql, count } from 'drizzle-orm';
import { logAudit } from '../../services/audit.js';
import { checkProviderHealth } from '../../services/health.js';
import { createProvider } from '../../providers/registry.js';
import { decrypt } from '../../crypto/encryption.js';
import { logger } from '../../middleware/logger.js';

export const adminProviderRoutes = new Hono();

// List all providers with credential and model counts
adminProviderRoutes.get('/', async (c) => {
  try {
    const allProviders = await db.select().from(providers);

    const enriched = await Promise.all(allProviders.map(async (p) => {
      const [credCount] = await db.select({ count: count() })
        .from(providerCredentials)
        .where(eq(providerCredentials.providerId, p.id));

      const [modelCount] = await db.select({ count: count() })
        .from(models)
        .where(eq(models.providerId, p.id));

      return {
        id: p.id,
        type: p.type,
        name: p.name,
        status: p.status,
        baseUrl: p.baseUrl,
        config: p.config,
        credentialCount: credCount?.count || 0,
        modelCount: modelCount?.count || 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    }));

    return c.json({ data: enriched });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to list providers');
    return c.json({ error: { type: 'server_error', message: 'Failed to list providers' } }, 500);
  }
});

// Create provider
adminProviderRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.type || !body.name) {
      return c.json({ error: { type: 'validation_error', message: 'type and name are required' } }, 400);
    }

    const validTypes = ['openai', 'anthropic', 'google', 'groq', 'ollama'];
    if (!validTypes.includes(body.type)) {
      return c.json({ error: { type: 'validation_error', message: `type must be one of: ${validTypes.join(', ')}` } }, 400);
    }

    const [provider] = await db.insert(providers).values({
      type: body.type,
      name: body.name,
      baseUrl: body.baseUrl || null,
      config: body.config || {},
      status: 'active',
    }).returning();

    await logAudit({
      actor: 'admin',
      action: 'provider.created',
      resourceType: 'provider',
      resourceId: provider.id,
      details: { type: body.type, name: body.name },
    });

    return c.json({ data: provider }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create provider');
    return c.json({ error: { type: 'server_error', message: 'Failed to create provider' } }, 500);
  }
});

// Update provider
adminProviderRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.status) updates.status = body.status;
    if (body.config) updates.config = body.config;

    const [updated] = await db.update(providers)
      .set(updates)
      .where(eq(providers.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: { type: 'not_found', message: 'Provider not found' } }, 404);
    }

    await logAudit({
      actor: 'admin',
      action: 'provider.updated',
      resourceType: 'provider',
      resourceId: id,
      details: { changes: Object.keys(updates).filter(k => k !== 'updatedAt') },
    });

    return c.json({ data: updated });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update provider');
    return c.json({ error: { type: 'server_error', message: 'Failed to update provider' } }, 500);
  }
});

// Delete provider (soft delete)
adminProviderRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const [updated] = await db.update(providers)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(providers.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: { type: 'not_found', message: 'Provider not found' } }, 404);
    }

    // Disable all credentials for this provider
    await db.update(providerCredentials)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(providerCredentials.providerId, id));

    await logAudit({
      actor: 'admin',
      action: 'provider.deleted',
      resourceType: 'provider',
      resourceId: id,
    });

    return c.json({ data: { id, deleted: true } });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to delete provider');
    return c.json({ error: { type: 'server_error', message: 'Failed to delete provider' } }, 500);
  }
});

// Test provider health
adminProviderRoutes.post('/:id/test', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await checkProviderHealth(id);
    return c.json({
      data: {
        ...result,
        healthy: result.status === 'healthy',
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to test provider');
    return c.json({ data: { healthy: false, error: err.message } });
  }
});

// GET /admin/providers/:id/models — List models for this provider
adminProviderRoutes.get('/:id/models', async (c) => {
  try {
    const providerId = c.req.param('id');
    const modelList = await db.select().from(models)
      .where(eq(models.providerId, providerId));
    return c.json({ data: modelList });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to list provider models');
    return c.json({ error: { type: 'server_error', message: err.message } }, 500);
  }
});

// POST /admin/providers/:id/models — Add model to this provider
adminProviderRoutes.post('/:id/models', async (c) => {
  try {
    const providerId = c.req.param('id');
    const body = await c.req.json();

    if (!body.modelId) {
      return c.json({ error: { type: 'validation_error', message: 'modelId is required' } }, 400);
    }

    // Check if model already exists for this provider
    const existing = await db.select().from(models)
      .where(and(eq(models.providerId, providerId), eq(models.modelId, body.modelId.trim())));

    if (existing.length > 0) {
      return c.json({ error: { type: 'conflict', message: 'Model already exists for this provider' } }, 409);
    }

    const [inserted] = await db.insert(models).values({
      providerId,
      modelId: body.modelId.trim(),
      displayName: body.displayName?.trim() || body.modelId.trim(),
      enabled: body.enabled !== undefined ? body.enabled : true,
    }).returning();

    await logAudit({
      actor: 'admin',
      action: 'model.added',
      resourceType: 'model',
      resourceId: inserted.id,
      details: { providerId, modelId: inserted.modelId },
    });

    return c.json({ data: inserted }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to add model to provider');
    return c.json({ error: { type: 'server_error', message: err.message } }, 500);
  }
});

// DELETE /admin/providers/:id/models/:modelId — Delete model
adminProviderRoutes.delete('/:id/models/:modelId', async (c) => {
  try {
    const providerId = c.req.param('id');
    const modelId = c.req.param('modelId');

    await db.delete(models)
      .where(and(eq(models.providerId, providerId), eq(models.modelId, modelId)));

    await logAudit({
      actor: 'admin',
      action: 'model.deleted',
      resourceType: 'model',
      details: { providerId, modelId },
    });

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to delete model');
    return c.json({ error: { type: 'server_error', message: err.message } }, 500);
  }
});

// POST /admin/providers/:id/sync-models — Sync available models from cloud API
adminProviderRoutes.post('/:id/sync-models', async (c) => {
  try {
    const providerId = c.req.param('id');
    const [providerDef] = await db.select().from(providers).where(eq(providers.id, providerId));
    if (!providerDef) {
      return c.json({ error: { type: 'not_found', message: 'Provider not found' } }, 404);
    }

    const creds = await db.select().from(providerCredentials)
      .where(and(eq(providerCredentials.providerId, providerId), eq(providerCredentials.enabled, true)))
      .limit(1);

    if (!creds.length) {
      return c.json({ error: { type: 'validation_error', message: 'No active credentials configured for this provider to fetch models' } }, 400);
    }

    const decryptedKey = decrypt({
      ciphertext: creds[0].encryptedKey,
      iv: creds[0].iv,
      authTag: creds[0].authTag,
    });

    const providerInstance = createProvider(
      providerDef.type,
      providerDef.id,
      providerDef.name,
      providerDef.baseUrl || undefined
    );

    const remoteModels = await providerInstance.listModels(decryptedKey);

    let syncedCount = 0;
    for (const m of remoteModels) {
      const existing = await db.select().from(models)
        .where(and(eq(models.providerId, providerId), eq(models.modelId, m.id)));

      if (existing.length === 0) {
        await db.insert(models).values({
          providerId,
          modelId: m.id,
          displayName: m.id,
          enabled: true,
        });
        syncedCount++;
      }
    }

    const allCurrent = await db.select().from(models).where(eq(models.providerId, providerId));

    return c.json({
      data: {
        syncedCount,
        totalModels: allCurrent.length,
        models: allCurrent,
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to sync models from provider API');
    return c.json({ error: { type: 'server_error', message: 'Failed to sync models: ' + err.message } }, 500);
  }
});
