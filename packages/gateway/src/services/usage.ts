import { db } from '../db/index.js';
import { usageRecords, requests } from '../db/schema/index.js';
import { eq, and, gte, sql, desc, count, sum } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger.js';

interface UsageData {
  requestId?: string;
  projectId: string;
  providerId?: string;
  credentialId?: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  status: number;
  cacheHit: boolean;
  error?: string;
}

export async function recordUsage(data: UsageData): Promise<void> {
  try {
    const reqId = data.requestId || `req_${uuidv4()}`;

    await db.insert(usageRecords).values({
      requestId: reqId,
      projectId: data.projectId,
      providerId: data.providerId || null,
      credentialId: data.credentialId || null,
      model: data.model,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      totalTokens: data.totalTokens || 0,
      latencyMs: data.latencyMs || 0,
      status: data.status,
      cacheHit: data.cacheHit,
      error: data.error || null,
    });

    // Also insert into requests table
    await db.insert(requests).values({
      requestId: reqId,
      projectId: data.projectId,
      providerId: data.providerId || null,
      credentialId: data.credentialId || null,
      model: data.model,
      status: data.status,
      latencyMs: data.latencyMs || 0,
      error: data.error || null,
    }).onConflictDoNothing();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to record usage');
  }
}

function getPeriodStart(period: 'today' | 'week' | 'month'): Date {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return weekAgo;
    case 'month':
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return monthAgo;
  }
}

export async function getUsageSummary(projectId: string, period: 'today' | 'week' | 'month') {
  const periodStart = getPeriodStart(period);

  const result = await db.select({
    requestCount: count(),
    inputTokens: sum(usageRecords.inputTokens),
    outputTokens: sum(usageRecords.outputTokens),
    totalTokens: sum(usageRecords.totalTokens),
    avgLatencyMs: sql<number>`COALESCE(AVG(${usageRecords.latencyMs}), 0)::int`,
    cacheHits: sql<number>`COUNT(*) FILTER (WHERE ${usageRecords.cacheHit} = true)`,
    totalRequests: count(),
  })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.projectId, projectId),
      gte(usageRecords.createdAt, periodStart)
    ));

  const row = result[0] || {};
  const total = Number(row.totalRequests) || 0;
  const hits = Number(row.cacheHits) || 0;

  return {
    requestCount: total,
    inputTokens: Number(row.inputTokens) || 0,
    outputTokens: Number(row.outputTokens) || 0,
    totalTokens: Number(row.totalTokens) || 0,
    avgLatencyMs: Number(row.avgLatencyMs) || 0,
    cacheHitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
    period,
  };
}

export async function getOverallUsageSummary(period: 'today' | 'week' | 'month') {
  const periodStart = getPeriodStart(period);

  const result = await db.select({
    requestCount: count(),
    inputTokens: sum(usageRecords.inputTokens),
    outputTokens: sum(usageRecords.outputTokens),
    totalTokens: sum(usageRecords.totalTokens),
    avgLatencyMs: sql<number>`COALESCE(AVG(${usageRecords.latencyMs}), 0)::int`,
    cacheHits: sql<number>`COUNT(*) FILTER (WHERE ${usageRecords.cacheHit} = true)`,
    totalRequests: count(),
  })
    .from(usageRecords)
    .where(gte(usageRecords.createdAt, periodStart));

  const row = result[0] || {};
  const total = Number(row.totalRequests) || 0;
  const hits = Number(row.cacheHits) || 0;

  return {
    requestCount: total,
    inputTokens: Number(row.inputTokens) || 0,
    outputTokens: Number(row.outputTokens) || 0,
    totalTokens: Number(row.totalTokens) || 0,
    avgLatencyMs: Number(row.avgLatencyMs) || 0,
    cacheHitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
    period,
  };
}

export async function getRecentRequests(projectId?: string, limit: number = 50) {
  const conditions = projectId
    ? and(eq(usageRecords.projectId, projectId))
    : undefined;

  const rows = await db.select()
    .from(usageRecords)
    .where(conditions)
    .orderBy(desc(usageRecords.createdAt))
    .limit(limit);

  return rows.map(row => ({
    requestId: row.requestId,
    model: row.model,
    providerId: row.providerId,
    status: row.status,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    cacheHit: row.cacheHit,
    error: row.error,
    createdAt: row.createdAt,
  }));
}

export async function getUsageByProvider(projectId?: string, period: 'today' | 'week' | 'month' = 'today') {
  const periodStart = getPeriodStart(period);
  const conditions = projectId
    ? and(eq(usageRecords.projectId, projectId), gte(usageRecords.createdAt, periodStart))
    : gte(usageRecords.createdAt, periodStart);

  return db.select({
    providerId: usageRecords.providerId,
    requestCount: count(),
    totalTokens: sum(usageRecords.totalTokens),
  })
    .from(usageRecords)
    .where(conditions)
    .groupBy(usageRecords.providerId);
}

export async function getUsageByModel(projectId?: string, period: 'today' | 'week' | 'month' = 'today') {
  const periodStart = getPeriodStart(period);
  const conditions = projectId
    ? and(eq(usageRecords.projectId, projectId), gte(usageRecords.createdAt, periodStart))
    : gte(usageRecords.createdAt, periodStart);

  return db.select({
    model: usageRecords.model,
    requestCount: count(),
    totalTokens: sum(usageRecords.totalTokens),
  })
    .from(usageRecords)
    .where(conditions)
    .groupBy(usageRecords.model);
}
