import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { PoolView } from '@/components/admin/views/pool';

export const metadata: Metadata = { title: 'Key pool & kits' };

export default async function Page() {
  await requireAdmin();
  return <PoolView />;
}
