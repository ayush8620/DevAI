import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { UsageView } from '@/components/admin/views/usage';

export const metadata: Metadata = { title: 'Usage' };

export default async function Page() {
  await requireAdmin();
  return <UsageView />;
}
