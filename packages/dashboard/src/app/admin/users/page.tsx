import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { UsersView } from '@/components/admin/views/users';

export const metadata: Metadata = { title: 'Users' };

export default async function Page() {
  await requireAdmin();
  return <UsersView />;
}
