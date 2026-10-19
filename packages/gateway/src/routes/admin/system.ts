import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../../types/index.js';
import { db } from '../../db/index.js';
import { adminAuthSettingsFromEnv, clerkEnabled } from '../../auth/admin.js';
import { getHealthStatus } from '../../services/health.js';
import { userDirectory } from '../../services/user-directory.js';
import { serverError } from './_util.js';

/** GET /admin/system: /v1/health plus version, commit, config flags and migration status. */
export const adminSystemRoutes = new Hono<AppEnv>();

const STARTED_AT = new Date().toISOString();

/** Tables each migration creates, to show which ones have been run. */
const MIGRATIONS: [string, string][] = [
  ['0001_key_pool_and_hackathon_kits', 'hackathon_kits'],
  ['0003_coupons', 'coupons'],
  ['0004_admin_panel', 'user_accounts'],
];

export function buildInfo(env: NodeJS.ProcessEnv = process.env) {
  return {
    version: env.npm_package_version || '1.0.0',
    // Render sets RENDER_GIT_COMMIT / RENDER_GIT_BRANCH on every deploy.
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || env.VERCEL_GIT_COMMIT_SHA || null,
    branch: env.RENDER_GIT_BRANCH || env.VERCEL_GIT_COMMIT_REF || null,
    service: env.RENDER_SERVICE_NAME || null,
    node: process.version,
    env: env.NODE_ENV || 'development',
    startedAt: STARTED_AT,
  };
}

adminSystemRoutes.get('/', async (c) => {
  try {
    const health = await getHealthStatus();
    let migrations: { name: string; applied: boolean | null }[] = MIGRATIONS.map(([name]) => ({ name, applied: null }));
    try {
      const res = await db.execute(sql`SELECT ${sql.join(MIGRATIONS.map(([, t]) => sql`to_regclass(${t}) IS NOT NULL AS ${sql.raw(`m_${t}`)}`), sql`, `)}`);
      const row = (((res as any).rows ?? res) as any[])[0] ?? {};
      migrations = MIGRATIONS.map(([name, t]) => ({ name, applied: Boolean(row[`m_${t}`]) }));
    } catch { /* database down: health already says so */ }
    const s = adminAuthSettingsFromEnv();
    return c.json({
      data: {
        health,
        build: buildInfo(),
        config: {
          clerk: clerkEnabled(s),
          clerkSecretKey: Boolean(s.clerkSecretKey),
          adminEmails: s.adminEmails.length,
          adminUserIds: s.adminUserIds.length,
          allowedOrigins: s.authorizedParties.length,
          userDirectory: userDirectory().source,
          redisConfigured: Boolean(process.env.REDIS_URL),
        },
        migrations,
      },
    });
  } catch (err) {
    return serverError(c, err, 'load the system status');
  }
});
