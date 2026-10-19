import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { SystemView } from '@/components/admin/views/system';
import { paymentsEnabled } from '@/lib/billing/razorpay';

export const metadata: Metadata = { title: 'System' };

export default async function Page() {
  const session = await requireAdmin();
  // Vercel sets these on every deploy.
  const dashboard = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    clerk: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    payments: paymentsEnabled(),
  };
  return <SystemView dashboard={dashboard} keyMode={session.mode === 'key'} />;
}
