import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { UserDetailView } from '@/components/admin/views/user-detail';

export const metadata: Metadata = { title: 'User' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <UserDetailView userId={decodeURIComponent(id)} />;
}
