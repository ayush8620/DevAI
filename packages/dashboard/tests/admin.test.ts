import { describe, it, expect } from 'vitest';
import { isAdminMeResponse } from '../src/lib/admin/me';
import robots from '../src/app/robots';
import sitemap from '../src/app/sitemap';
import nextConfig from '../next.config';
import { readFileSync } from 'node:fs';
import { ADMIN_ROUTES } from '../src/lib/admin/routes';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('admin gate', () => {
  it('accepts only a 200 Clerk answer from the gateway /admin/me', () => {
    expect(isAdminMeResponse(200, { data: { method: 'clerk', userId: 'user_1', email: 'a@b.c' } })).toBe(true);
    expect(isAdminMeResponse(200, { data: { method: 'admin_key' } })).toBe(false); // a session never maps to the key
    expect(isAdminMeResponse(403, { error: { type: 'permission_error' } })).toBe(false);
    expect(isAdminMeResponse(200, null)).toBe(false);
    expect(isAdminMeResponse(500, { data: { method: 'clerk', userId: 'user_1' } })).toBe(false);
  });
});

describe('user dashboard has no admin features', () => {
  it('sidebar routes are user pages only, plus one Admin link gated on isAdmin', () => {
    const sidebar = src('components/layout/sidebar.tsx');
    const routes = sidebar.slice(sidebar.indexOf('DASHBOARD_ROUTES'), sidebar.indexOf('];'));
    const hrefs = Array.from(routes.matchAll(/href: '([^']+)'/g), m => m[1]);
    expect(hrefs.length).toBeGreaterThan(5);
    expect(hrefs.every(h => h.startsWith('/dashboard'))).toBe(true);
    for (const gone of ['/dashboard/coupons', '/dashboard/providers', '/dashboard/projects']) expect(hrefs).not.toContain(gone);
    expect(sidebar).toMatch(/\{isAdmin && \(\s*<Link href="\/admin"/);
  });
  it('user pages never call admin endpoints', () => {
    for (const p of ['app/dashboard/page.tsx', 'app/dashboard/usage/page.tsx', 'app/dashboard/settings/page.tsx', 'app/dashboard/pool/page.tsx', 'app/dashboard/kits/page.tsx', 'components/layout/sidebar.tsx']) {
      const s = src(p);
      expect(s, p).not.toMatch(/admin-api|\/admin\/(?!['"`])/);
      expect(s, p).not.toMatch(/getAdminKey|setAdminKey/);
    }
  });
  it('old admin URLs redirect to the admin panel', async () => {
    const r = await nextConfig.redirects!();
    expect(r).toContainEqual(expect.objectContaining({ source: '/dashboard/coupons', destination: '/admin/coupons' }));
    expect(r).toContainEqual(expect.objectContaining({ source: '/dashboard/providers', destination: '/admin/providers' }));
  });
  it('admin panel has every section', () => {
    expect(ADMIN_ROUTES.map(r => r.href)).toEqual(['/admin', '/admin/users', '/admin/subscriptions', '/admin/coupons', '/admin/providers', '/admin/projects', '/admin/usage', '/admin/pool', '/admin/audit', '/admin/system']);
  });
});

describe('admin is never indexed', () => {
  it('robots disallows /admin and the sitemap leaves it out', async () => {
    const rules = robots().rules as { disallow: string[] }[];
    expect(rules[0].disallow).toContain('/admin');
    expect(sitemap().some(e => e.url.includes('/admin'))).toBe(false);
    const h = await nextConfig.headers!();
    expect(h.find(x => x.source === '/admin/:path*')?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' });
  });
});
