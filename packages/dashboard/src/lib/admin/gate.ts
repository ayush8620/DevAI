import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { isAdminMeResponse } from './me';

/**
 * Server-side gate for /admin. Runs in the admin layout AND in every admin page (React cache()
 * makes it one check per request), because a layout alone is not re-run on client navigation.
 *
 *  - Clerk configured (production): the user must be signed in, and the gateway's GET /admin/me
 *    must accept their session, which means their verified email is on ADMIN_EMAILS (or their id
 *    on ADMIN_USER_IDS) on Render. Signed-out users go to sign-in; everyone else gets a 404.
 *  - No Clerk keys: only outside production (local dev), or with ADMIN_PANEL_WITHOUT_CLERK=1 for a
 *    self-hosted gateway. The panel then calls the gateway with the ADMIN_API_KEY saved in the
 *    browser (System page), and the gateway refuses every call without it.
 */
export type AdminSession =
  | { mode: 'clerk'; userId: string; email: string | null }
  | { mode: 'key' };

const GATEWAY_URL = (process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export const clerkConfigured = () => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export const requireAdmin = cache(async (): Promise<AdminSession> => {
  if (!clerkConfigured()) {
    if (process.env.NODE_ENV !== 'production' || process.env.ADMIN_PANEL_WITHOUT_CLERK === '1') return { mode: 'key' };
    notFound();
  }
  const { userId, getToken } = await auth();
  if (!userId) redirect(`${process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in'}?redirect_url=%2Fadmin`);
  const token = await getToken().catch(() => null);
  if (!token) notFound();
  let ok = false;
  let email: string | null = null;
  try {
    const res = await fetch(`${GATEWAY_URL}/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => null);
    ok = isAdminMeResponse(res.status, body) && body.data.userId === userId;
    if (ok) email = (body as any).data.email ?? null;
  } catch (err: any) {
    // Gateway unreachable: deny (we cannot tell who is an admin).
    console.error('Admin gate: gateway /admin/me failed:', err?.message || err);
  }
  if (!ok) notFound();
  return { mode: 'clerk', userId, email };
});
