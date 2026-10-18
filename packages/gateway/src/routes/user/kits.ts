import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { hackathonKits, projects, apiKeys } from '../../db/schema/index.js';
import { generateApiKey } from '../../crypto/encryption.js';
import { kitUsage } from '../../engine/kit-limits.js';
import { logAudit } from '../../services/audit.js';
import { logger } from '../../middleware/logger.js';
import type { AppEnv } from '../../types/index.js';

/**
 * Hackathon kits: temporary team API keys with caps and an expiry. Kit traffic routes over
 * the owner's personal key pool. Creating kits needs the Team plan (or a gateway admin).
 */
export const userKitRoutes = new Hono<AppEnv>();

export const KIT_LIMITS = { maxKeys: 50, maxDays: 30, maxModels: 20 } as const;

export interface KitInput {
  name: string;
  expiresAt: Date;
  requestCap: number | null;
  tokenCap: number | null;
  maxTeamSize: number | null;
  keyCount: number;
  allowedModels: string[];
}

const optInt = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

/** Validate a create-kit body. Pure, so it is unit-tested. */
export function parseKitInput(body: any, now: Date = new Date()): { ok: true; value: KitInput } | { ok: false; message: string } {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return { ok: false, message: 'name is required' };
  const exp = new Date(body?.expiresAt);
  if (!Number.isFinite(exp.getTime())) return { ok: false, message: 'expiresAt must be a date and time (ISO 8601)' };
  if (exp.getTime() <= now.getTime() + 60_000) return { ok: false, message: 'expiresAt must be in the future' };
  if (exp.getTime() > now.getTime() + KIT_LIMITS.maxDays * 86_400_000) return { ok: false, message: `A kit can last at most ${KIT_LIMITS.maxDays} days` };
  const requestCap = optInt(body?.requestCap);
  const tokenCap = optInt(body?.tokenCap);
  const maxTeamSize = optInt(body?.maxTeamSize);
  for (const [k, v] of [['requestCap', requestCap], ['tokenCap', tokenCap], ['maxTeamSize', maxTeamSize]] as const) {
    if (v !== null && !(Number.isInteger(v) && v > 0)) return { ok: false, message: `${k} must be a positive whole number` };
  }
  if (requestCap === null && tokenCap === null) return { ok: false, message: 'Set a requestCap or a tokenCap (or both)' };
  const keyCount = optInt(body?.keyCount) ?? maxTeamSize ?? 1;
  if (!(Number.isInteger(keyCount) && keyCount >= 1 && keyCount <= KIT_LIMITS.maxKeys)) return { ok: false, message: `keyCount must be 1-${KIT_LIMITS.maxKeys}` };
  if (maxTeamSize !== null && keyCount > maxTeamSize) return { ok: false, message: 'keyCount cannot be more than maxTeamSize' };
  const rawModels: unknown[] = Array.isArray(body?.allowedModels) ? body.allowedModels
    : typeof body?.allowedModels === 'string' ? body.allowedModels.split(',') : [];
  const allowedModels = [...new Set(rawModels.map(m => String(m).trim()).filter(Boolean))].slice(0, KIT_LIMITS.maxModels);
  return { ok: true, value: { name, expiresAt: exp, requestCap, tokenCap, maxTeamSize, keyCount, allowedModels } };
}

export function kitStatus(k: { status: string; expiresAt: Date | string }, now = Date.now()): 'active' | 'expired' | 'revoked' {
  if (k.status === 'revoked') return 'revoked';
  return new Date(k.expiresAt).getTime() > now ? 'active' : 'expired';
}

async function describe(k: typeof hackathonKits.$inferSelect) {
  const usage = await kitUsage(k);
  return {
    id: k.id, name: k.name, shareToken: k.shareToken, status: kitStatus(k),
    expiresAt: k.expiresAt, requestCap: k.requestCap, tokenCap: k.tokenCap, maxTeamSize: k.maxTeamSize,
    keyCount: k.keyCount, allowedModels: k.allowedModels ?? [], createdAt: k.createdAt, revokedAt: k.revokedAt,
    usage,
  };
}

userKitRoutes.get('/', async (c) => {
  const user = c.get('user')!;
  const kits = await db.select().from(hackathonKits).where(eq(hackathonKits.ownerUserId, user.userId)).orderBy(desc(hackathonKits.createdAt));
  return c.json({ data: { canCreate: user.limits.kits, plan: user.plan, isAdmin: user.isAdmin, kits: await Promise.all(kits.map(describe)) } });
});

userKitRoutes.post('/', async (c) => {
  const user = c.get('user')!;
  if (!user.limits.kits) {
    return c.json({ error: { type: 'plan_required', message: 'Hackathon kits are part of the Team plan.' } }, 403);
  }
  const parsed = parseKitInput(await c.req.json().catch(() => ({})));
  if (!parsed.ok) return c.json({ error: { type: 'validation_error', message: parsed.message } }, 400);
  const v = parsed.value;
  try {
    const [project] = await db.insert(projects).values({
      name: `Kit: ${v.name}`, description: 'Hackathon kit', status: 'active', kind: 'kit', ownerUserId: user.userId,
    }).returning();
    const [kit] = await db.insert(hackathonKits).values({
      ownerUserId: user.userId, projectId: project.id, name: v.name,
      shareToken: randomBytes(12).toString('base64url'),
      requestCap: v.requestCap, tokenCap: v.tokenCap, maxTeamSize: v.maxTeamSize, keyCount: v.keyCount,
      allowedModels: v.allowedModels, expiresAt: v.expiresAt, status: 'active',
    }).returning();
    const keys: { id: string; name: string; key: string }[] = [];
    for (let i = 1; i <= v.keyCount; i++) {
      const { key, prefix, hash } = generateApiKey();
      const name = v.keyCount === 1 ? 'Team key' : `Member ${i}`;
      const [row] = await db.insert(apiKeys).values({ projectId: project.id, name, keyPrefix: prefix, keyHash: hash, status: 'active' }).returning();
      keys.push({ id: row.id, name, key });
    }
    await logAudit({ actor: `clerk:${user.userId}`, action: 'kit.created', resourceType: 'hackathon_kit', resourceId: kit.id, details: { name: v.name, keys: v.keyCount } });
    return c.json({ data: { ...(await describe(kit)), keys }, warning: 'Save these API keys now. They will not be shown again.' }, 201);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create kit');
    return c.json({ error: { type: 'server_error', message: 'Failed to create the kit' } }, 500);
  }
});

userKitRoutes.post('/:id/revoke', async (c) => {
  const user = c.get('user')!;
  const [kit] = await db.update(hackathonKits).set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(hackathonKits.id, c.req.param('id')), eq(hackathonKits.ownerUserId, user.userId))).returning();
  if (!kit) return c.json({ error: { type: 'not_found', message: 'Kit not found' } }, 404);
  await logAudit({ actor: `clerk:${user.userId}`, action: 'kit.revoked', resourceType: 'hackathon_kit', resourceId: kit.id });
  return c.json({ data: await describe(kit) });
});
