import { Hono } from 'hono';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { models, providers } from '../../db/schema/index.js';
import { resolveModelForProvider } from '../../engine/router.js';
import type { AppEnv } from '../../types/index.js';

export const modelsRoutes = new Hono<AppEnv>();

/**
 * Models the caller can use: only those of the providers its API key routes over (the key
 * owner's own providers, or the shared providers for the admin's app projects). With no
 * provider keys the list is empty.
 */
modelsRoutes.get('/', async (c) => {
  const project = c.get('project');
  const ownerUserId: string | null = project?.ownerUserId ?? null;
  const owned = await db.select().from(providers).where(and(
    eq(providers.status, 'active'),
    ownerUserId ? eq(providers.ownerUserId, ownerUserId) : isNull(providers.ownerUserId),
  ));
  const rows = owned.length
    ? await db.select().from(models).where(and(inArray(models.providerId, owned.map(p => p.id)), eq(models.enabled, true)))
    : [];
  const seen = new Set<string>();
  const data: { id: string; object: 'model'; created: number; owned_by: string }[] = [];
  const add = (id: string, ownedBy: string, created?: Date | null) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    data.push({ id, object: 'model', created: Math.floor((created?.getTime() || Date.now()) / 1000), owned_by: ownedBy });
  };
  for (const m of rows) add(m.modelId, owned.find(p => p.id === m.providerId)?.name ?? 'devai', m.createdAt);
  // Each provider's default model for "auto" (set per key in the dashboard, else the type default)
  for (const p of owned) {
    const dm = (p.config as any)?.defaultModel;
    add(typeof dm === 'string' && dm ? dm : resolveModelForProvider(p.type, 'auto'), p.name, p.createdAt);
  }
  return c.json({ object: 'list', data });
});
