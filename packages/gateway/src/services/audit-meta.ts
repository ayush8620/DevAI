import { asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/index.js';

/** Distinct audit actions and resource types (filter options on the admin audit page). */
export async function selectDistinct() {
  const [actions, types] = await Promise.all([
    db.selectDistinct({ v: auditLogs.action }).from(auditLogs).orderBy(asc(auditLogs.action)).limit(200),
    db.selectDistinct({ v: auditLogs.resourceType }).from(auditLogs).orderBy(asc(auditLogs.resourceType)).limit(100),
  ]);
  return { actions: actions.map(r => r.v), resourceTypes: types.map(r => r.v) };
}
