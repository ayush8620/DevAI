import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { authenticateAdmin, clearEmailCache, type AdminAuthSettings } from '../../auth/admin.js';

// The middleware imports the DB for /v1 keys; admin paths never touch it.
vi.mock('../../db/index.js', () => ({ db: {}, schema: {} }));

const DASH = 'https://devai-dashboard-six.vercel.app';
const ADMIN_KEY = 'test_admin_key_0123456789';
let privateKey: CryptoKey;
let otherKey: CryptoKey;
let base: AdminAuthSettings;

async function sessionToken(opts: { sub?: string; azp?: string | null; exp?: number; key?: CryptoKey; extra?: Record<string, unknown> } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const azp = opts.azp === null ? {} : { azp: opts.azp ?? DASH };
  return new SignJWT({ ...azp, sid: 'sess_test', ...(opts.extra || {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'ins_test', typ: 'JWT' })
    .setSubject(opts.sub ?? 'user_admin')
    .setIssuer('https://test.clerk.accounts.dev')
    .setIssuedAt(now - 5)
    .setNotBefore(now - 5)
    .setExpirationTime(opts.exp ?? now + 60)
    .sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  base = {
    adminApiKey: ADMIN_KEY,
    clerkSecretKey: 'sk_test_dummy',
    // Networkless verification with Clerk's own verifyToken (same code path as production with CLERK_JWT_KEY).
    clerkJwtKey: await exportSPKI(pair.publicKey),
    authorizedParties: [DASH],
    adminEmails: ['owner@example.com'],
    adminUserIds: [],
  };
});
beforeEach(() => clearEmailCache());

const emailsOf: Record<string, string[]> = { user_admin: ['Owner@Example.com'], user_other: ['someone@example.com'] };
const deps = { getUserEmails: vi.fn(async (id: string) => emailsOf[id] || []) };

describe('admin auth', () => {
  it('accepts the ADMIN_API_KEY', async () => {
    expect(await authenticateAdmin(ADMIN_KEY, base, deps)).toEqual({ ok: true, method: 'admin_key' });
  });

  it('rejects a wrong admin key with 401', async () => {
    expect(await authenticateAdmin('nope', base, deps)).toMatchObject({ ok: false, status: 401 });
  });

  it('accepts a valid Clerk session token of an allowlisted email (looked up once, then cached)', async () => {
    deps.getUserEmails.mockClear();
    const t = await sessionToken();
    expect(await authenticateAdmin(t, base, deps)).toEqual({ ok: true, method: 'clerk', userId: 'user_admin', email: 'owner@example.com' });
    expect(await authenticateAdmin(t, base, deps)).toMatchObject({ ok: true });
    expect(deps.getUserEmails).toHaveBeenCalledTimes(1);
  });

  it('accepts an allowlisted user id without an email lookup', async () => {
    deps.getUserEmails.mockClear();
    const s = { ...base, adminEmails: [], adminUserIds: ['user_admin'] };
    expect(await authenticateAdmin(await sessionToken(), s, deps)).toMatchObject({ ok: true, method: 'clerk', userId: 'user_admin' });
    expect(deps.getUserEmails).not.toHaveBeenCalled();
  });

  it('uses an email claim from a custom session token when present', async () => {
    deps.getUserEmails.mockClear();
    const t = await sessionToken({ sub: 'user_x', extra: { email: 'owner@example.com' } });
    expect(await authenticateAdmin(t, base, deps)).toMatchObject({ ok: true, email: 'owner@example.com' });
    expect(deps.getUserEmails).not.toHaveBeenCalled();
  });

  it('returns 403 for a valid token of a user who is not allowlisted', async () => {
    const t = await sessionToken({ sub: 'user_other' });
    expect(await authenticateAdmin(t, base, deps)).toMatchObject({ ok: false, status: 403 });
  });

  it('returns 403 for Clerk tokens when no allowlist is configured (admin key still works)', async () => {
    const s = { ...base, adminEmails: [], adminUserIds: [] };
    expect(await authenticateAdmin(await sessionToken(), s, deps)).toMatchObject({ ok: false, status: 403 });
    expect(await authenticateAdmin(ADMIN_KEY, s, deps)).toMatchObject({ ok: true });
  });

  it('returns 401 for bad tokens: wrong signature, expired, wrong or missing azp, garbage', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const t of [
      await sessionToken({ key: otherKey }),
      await sessionToken({ exp: now - 120 }),
      await sessionToken({ azp: 'https://evil.example.com' }),
      await sessionToken({ azp: null }), // azp is required once ALLOWED_ORIGINS is set
      'aaa.bbb.ccc',
    ]) {
      expect(await authenticateAdmin(t, base, deps)).toMatchObject({ ok: false, status: 401 });
    }
  });

  it('ignores Clerk tokens when Clerk is not configured', async () => {
    const s = { ...base, clerkSecretKey: undefined, clerkJwtKey: undefined };
    expect(await authenticateAdmin(await sessionToken(), s, deps)).toMatchObject({ ok: false, status: 401 });
  });
});

describe('admin auth middleware (HTTP)', () => {
  it('maps results to 200 / 401 / 403', async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.CLERK_JWT_KEY = base.clerkJwtKey!.replace(/\n/g, '\\n'); // env-style escaped PEM
    process.env.CLERK_SECRET_KEY = '';
    process.env.ALLOWED_ORIGINS = DASH;
    process.env.ADMIN_USER_IDS = 'user_admin';
    process.env.ADMIN_EMAILS = '';
    const { authMiddleware } = await import('../../middleware/auth.js');
    const app = new Hono();
    app.use('/admin/*', authMiddleware);
    app.get('/admin/ping', c => c.json({ ok: true }));
    const { adminMeRoutes } = await import('../../routes/admin/me.js');
    app.route('/admin/me', adminMeRoutes);
    const call = (token?: string) => app.request('/admin/ping', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

    expect((await call(ADMIN_KEY)).status).toBe(200);
    expect((await call(await sessionToken())).status).toBe(200);
    const forbidden = await call(await sessionToken({ sub: 'user_other' }));
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.type).toBe('permission_error');
    expect((await call(await sessionToken({ key: otherKey }))).status).toBe(401);
    expect((await call()).status).toBe(401);

    const me = await app.request('/admin/me', { headers: { Authorization: `Bearer ${await sessionToken()}` } });
    expect((await me.json()).data).toEqual({ method: 'clerk', userId: 'user_admin', email: null });
  });
});
