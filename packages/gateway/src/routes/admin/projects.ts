import { Hono } from 'hono';
import { db } from '../../db/index.js';
import { projects, apiKeys, usageRecords } from '../../db/schema/index.js';
import { eq, count } from 'drizzle-orm';
import { logAudit } from '../../services/audit.js';
import { logger } from '../../middleware/logger.js';

export const adminProjectRoutes = new Hono();

// List all projects with stats
adminProjectRoutes.get('/', async (c) => {
  try {
    const allProjects = await db.select().from(projects);

    const enriched = await Promise.all(allProjects.map(async (p) => {
      const [keyCount] = await db.select({ count: count() })
        .from(apiKeys)
        .where(eq(apiKeys.projectId, p.id));

      const [requestCount] = await db.select({ count: count() })
        .from(usageRecords)
        .where(eq(usageRecords.projectId, p.id));

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        apiKeyCount: keyCount?.count || 0,
        requestCount: requestCount?.count || 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    }));

    return c.json({ data: enriched });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to list projects');
    return c.json({ error: { type: 'server_error', message: 'Failed to list projects' } }, 500);
  }
});

// Create project
adminProjectRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.name) {
      return c.json({ error: { type: 'validation_error', message: 'name is required' } }, 400);
    }

    const [project] = await db.insert(projects).values({
      name: body.name,
      description: body.description || null,
      status: 'active',
    }).returning();

    await logAudit({
      actor: 'admin',
      action: 'project.created',
      resourceType: 'project',
      resourceId: project.id,
      details: { name: body.name },
    });

    return c.json({ data: project }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create project');
    return c.json({ error: { type: 'server_error', message: 'Failed to create project' } }, 500);
  }
});

// Update project
adminProjectRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status) updates.status = body.status;

    const [updated] = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: { type: 'not_found', message: 'Project not found' } }, 404);
    }

    await logAudit({
      actor: 'admin',
      action: 'project.updated',
      resourceType: 'project',
      resourceId: id,
      details: { changes: Object.keys(updates).filter(k => k !== 'updatedAt') },
    });

    return c.json({ data: updated });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update project');
    return c.json({ error: { type: 'server_error', message: 'Failed to update project' } }, 500);
  }
});

// Delete project (soft delete)
adminProjectRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const [updated] = await db.update(projects)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: { type: 'not_found', message: 'Project not found' } }, 404);
    }

    // Revoke all API keys for this project
    await db.update(apiKeys)
      .set({ status: 'revoked' })
      .where(eq(apiKeys.projectId, id));

    await logAudit({
      actor: 'admin',
      action: 'project.deleted',
      resourceType: 'project',
      resourceId: id,
    });

    return c.json({ data: { id, deleted: true } });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to delete project');
    return c.json({ error: { type: 'server_error', message: 'Failed to delete project' } }, 500);
  }
});
