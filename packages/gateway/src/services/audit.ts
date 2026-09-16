import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';

interface AuditEntry {
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(data: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actor: data.actor,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId || null,
      details: data.details || {},
      ipAddress: data.ipAddress || null,
    });
  } catch (err) {
    // Audit logging should never block the main operation
    console.error('Audit log error:', err);
  }
}

interface AuditFilters {
  actor?: string;
  action?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}

export async function getAuditLogs(filters: AuditFilters = {}) {
  const { limit = 50, offset = 0 } = filters;

  const conditions: any[] = [];
  if (filters.actor) conditions.push(eq(auditLogs.actor, filters.actor));
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}
