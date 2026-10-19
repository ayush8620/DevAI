import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { AdminShell } from '@/components/admin/shell';

// Never prerendered or cached: every request is checked against the gateway allowlist.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'DevAI Admin', template: '%s · DevAI Admin' },
  description: 'DevAI operator console.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return <AdminShell email={session.mode === 'clerk' ? session.email : null} keyMode={session.mode === 'key'}>{children}</AdminShell>;
}
