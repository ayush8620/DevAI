import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { providerCredentials, providers, usageRecords, healthChecks, rateLimits } from '../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt, maskApiKey } from '../../crypto/encryption.js';
import { createProvider } from '../../providers/registry.js';
import { logAudit } from '../../services/audit.js';
import { adminActor } from '../../auth/admin.js';
import { logger } from '../../middleware/logger.js';
import { byPriority } from '../../engine/keys.js';
import { getKeyUsage } from '../../engine/key-usage.js';
import { keyCooldownLeft, clearKeyCooldown } from '../../engine/circuit.js';
import { cacheGet, cacheSet, cacheDel } from '../../cache/redis.js';

export const adminCredentialRoutes = new Hono();

// GET /admin/providers/:providerId/credentials — handled via provider routes
// This route handles /admin/credentials/:id operations

// List credentials for a provider
adminCredentialRoutes.get('/provider/:providerId', async (c) => {
  try {
    const providerId = c.req.param('providerId');
    const [provider] = await db.select().from(providers).where(eq(providers.id, providerId));
    const creds = (await db.select().from(providerCredentials)
      .where(eq(providerCredentials.providerId, providerId)))
      .sort((a, b) => (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0));
    const keyOrder: string[] = Array.isArray((provider?.config as any)?.keyOrder) ? (provider!.config as any).keyOrder : [];
    const ordered = byPriority(creds.map(c => ({ ...c, credentialId: c.id })), keyOrder);
    const usage = await getKeyUsage(ordered.map(c => c.id));

    // Never return decrypted keys: only the real prefix + last 4 characters
    const masked = await Promise.all(ordered.map(async (cred, i) => {
      let maskedKey = '••••';
      try { maskedKey = maskApiKey(decrypt({ ciphertext: cred.encryptedKey, iv: cred.iv, authTag: cred.authTag })); } catch { /* wrong master key */ }
      const cooldownSec = await keyCooldownLeft(cred.id);
      const health = await cacheGet(`health:key:${cred.id}`);
      const recent = await cacheGet(`keyerr:${cred.id}`);
      let lastFailure: any = null;
      try { lastFailure = recent ? JSON.parse(recent) : null; } catch { /* ignore */ }
      const liveStatus = !cred.enabled || cred.status === 'disabled' ? 'disabled'
        : cooldownSec > 0 ? (lastFailure?.kind === 'rate_limited' ? 'rate_limited' : lastFailure?.kind === 'auth' ? 'invalid' : lastFailure?.kind === 'quota' ? 'quota_exhausted' : 'cooling_down')
        : health === 'unhealthy' ? 'unhealthy' : 'active';
      return {
      id: cred.id,
      providerId: cred.providerId,
      name: cred.name,
      maskedKey,
      priority: i + 1,
      liveStatus,
      cooldownSec,
      health: health ?? 'unknown',
      requestsThisMinute: usage[cred.id] ?? 0,
      enabled: cred.enabled,
      status: cred.status,
      quotaLimit: cred.quotaLimit,
      quotaUsed: cred.quotaUsed,
      quotaResetAt: cred.quotaResetAt,
      lastError: cred.lastError,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    };
    }));

    return c.json({ data: masked });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to list credentials');
    return c.json({ error: { type: 'server_error', message: 'Failed to list credentials' } }, 500);
  }
});

// Add credential to a provider
adminCredentialRoutes.post('/provider/:providerId', async (c) => {
  try {
    const providerId = c.req.param('providerId');
    const body = await c.req.json();

    if (!body.name || !body.apiKey) {
      return c.json({ error: { type: 'validation_error', message: 'name and apiKey are required' } }, 400);
    }

    // Verify provider exists
    const [provider] = await db.select().from(providers).where(eq(providers.id, providerId));
    if (!provider) {
      return c.json({ error: { type: 'not_found', message: 'Provider not found' } }, 404);
    }

    // Encrypt the API key
    const { ciphertext, iv, authTag } = encrypt(body.apiKey);

    const [credential] = await db.insert(providerCredentials).values({
      providerId,
      name: body.name,
      encryptedKey: ciphertext,
      iv,
      authTag,
      enabled: true,
      status: 'active',
      quotaLimit: body.quotaLimit || null,
    }).returning();

    await logAudit({
      actor: adminActor(c),
      action: 'credential.created',
      resourceType: 'credential',
      resourceId: credential.id,
      details: { providerId, name: body.name },
      ipAddress: c.req.header('x-forwarded-for') || 'unknown',
    });

    return c.json({
      data: {
        id: credential.id,
        providerId: credential.providerId,
        name: credential.name,
        maskedKey: maskApiKey(body.apiKey),
        enabled: credential.enabled,
        status: credential.status,
        createdAt: credential.createdAt,
      }
    }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create credential');
    return c.json({ error: { type: 'server_error', message: 'Failed to create credential' } }, 500);
  }
});

// Update credential (enable/disable, name)
adminCredentialRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.name) updates.name = body.name;
    if (body.status) updates.status = body.status;

    const [updated] = await db.update(providerCredentials)
      .set(updates)
      .where(eq(providerCredentials.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: { type: 'not_found', message: 'Credential not found' } }, 404);
    }

    await logAudit({
      actor: adminActor(c),
      action: 'credential.updated',
      resourceType: 'credential',
      resourceId: id,
      details: { changes: Object.keys(updates).filter(k => k !== 'updatedAt') },
    });

    return c.json({
      data: {
        id: updated.id,
        name: updated.name,
        enabled: updated.enabled,
        status: updated.status,
        updatedAt: updated.updatedAt,
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update credential');
    return c.json({ error: { type: 'server_error', message: 'Failed to update credential' } }, 500);
  }
});

// Delete credential
adminCredentialRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Rows that reference the key would block the delete (FK). Keep usage history
    // (detached from the key), drop its health checks / rate-limit rows, then delete.
    // Retried because a request that just used the key may insert a usage row meanwhile.
    let deleted: typeof providerCredentials.$inferSelect | undefined;
    for (let attempt = 1; ; attempt++) {
      try {
        await db.update(usageRecords).set({ credentialId: null }).where(eq(usageRecords.credentialId, id));
        await db.delete(healthChecks).where(eq(healthChecks.credentialId, id));
        await db.delete(rateLimits).where(eq(rateLimits.credentialId, id));
        [deleted] = await db.delete(providerCredentials)
          .where(eq(providerCredentials.id, id))
          .returning();
        break;
      } catch (err: any) {
        const fk = err?.code === '23503' || err?.cause?.code === '23503' || /foreign key/i.test(String(err?.message));
        if (!fk || attempt >= 3) throw err;
        await new Promise(r => setTimeout(r, 150 * attempt));
      }
    }
    if (deleted) {
      await clearKeyCooldown(id);
      await cacheDel(`health:key:${id}`);
      await cacheDel(`keyerr:${id}`);
    }

    if (!deleted) {
      return c.json({ error: { type: 'not_found', message: 'Credential not found' } }, 404);
    }

    await logAudit({
      actor: adminActor(c),
      action: 'credential.deleted',
      resourceType: 'credential',
      resourceId: id,
    });

    return c.json({ data: { id, deleted: true } });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to delete credential');
    return c.json({ error: { type: 'server_error', message: 'Failed to delete credential' } }, 500);
  }
});

// Test credential
adminCredentialRoutes.post('/:id/test', async (c) => {
  try {
    const id = c.req.param('id');

    const [cred] = await db.select().from(providerCredentials)
      .where(eq(providerCredentials.id, id));
    if (!cred) {
      return c.json({ error: { type: 'not_found', message: 'Credential not found' } }, 404);
    }

    const [providerDef] = await db.select().from(providers)
      .where(eq(providers.id, cred.providerId));
    if (!providerDef) {
      return c.json({ error: { type: 'not_found', message: 'Provider not found' } }, 404);
    }

    const decryptedKey = decrypt({
      ciphertext: cred.encryptedKey,
      iv: cred.iv,
      authTag: cred.authTag,
    });

    const provider = createProvider(providerDef.type, providerDef.id, providerDef.name, providerDef.baseUrl || undefined);
    const result = await provider.healthCheck(decryptedKey);

    // Update credential status based on result
    // A failed test is recorded but the key stays routable: routing cools it down on errors
    // and it recovers automatically. A passing test clears any cooldown right away.
    await db.update(providerCredentials)
      .set({
        status: cred.status === 'disabled' ? 'disabled' : result.healthy ? 'active' : 'error',
        lastError: result.healthy ? null : 'Health check failed',
        updatedAt: new Date(),
      })
      .where(eq(providerCredentials.id, id));
    await cacheSet(`health:key:${id}`, result.healthy ? 'healthy' : 'unhealthy', 300);
    if (result.healthy) {
      await clearKeyCooldown(id);
      await cacheDel(`keyerr:${id}`);
      await cacheDel(`ratelimit:${id}`);
    }

    return c.json({
      data: {
        id,
        healthy: result.healthy,
        latencyMs: result.latencyMs,
      }
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to test credential');
    return c.json({
      data: {
        id: c.req.param('id'),
        healthy: false,
        error: 'Test failed: ' + err.message,
      }
    });
  }
});
