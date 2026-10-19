import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import ProvidersView from '@/components/admin/views/providers';

export const metadata: Metadata = { title: 'Shared providers' };

export default async function Page() {
  await requireAdmin();
  return <ProvidersView />;
}
