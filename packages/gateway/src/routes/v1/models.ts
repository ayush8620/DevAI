import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { models } from '../../db/schema/index.js';

export const modelsRoutes = new Hono();

modelsRoutes.get('/', async (c) => {
  const allModels = await db.select().from(models);
  return c.json({
    object: 'list',
    data: allModels.map(m => ({
      id: m.modelId,
      object: 'model',
      created: Math.floor((m.createdAt?.getTime() || Date.now()) / 1000),
      owned_by: 'devai'
    }))
  });
});
