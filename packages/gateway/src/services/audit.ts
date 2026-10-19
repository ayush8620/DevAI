import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/index.js';
import { eq, and, desc, gte, lte, ilike, or, type SQL } from 'drizzle-orm';

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

export interface AuditFilters {
  actor?: string;
  /** Exact action, or a prefix ending in "." (e.g. "user.") */
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  /** Free text over actor, action and resource id */
  q?: string;
  limit?: number;
  offset?: number;
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, m => `\\${m}`)}%`;

export async function getAuditLogs(filters: AuditFilters = {}) {
  const { limit = 50, offset = 0 } = filters;

  const conditions: (SQL | undefined)[] = [];
  if (filters.actor) conditions.push(ilike(auditLogs.actor, like(filters.actor)));
  if (filters.action) conditions.push(filters.action.endsWith('.') ? ilike(auditLogs.action, `${filters.action.replace(/[\\%_]/g, m => `\\${m}`)}%`) : eq(auditLogs.action, filters.action));
  if (filters.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  if (filters.resourceId) conditions.push(eq(auditLogs.resourceId, filters.resourceId));
  if (filters.from) conditions.push(gte(auditLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(auditLogs.createdAt, filters.to));
  if (filters.q) conditions.push(or(ilike(auditLogs.actor, like(filters.q)), ilike(auditLogs.action, like(filters.q)), ilike(auditLogs.resourceId, like(filters.q))));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}
