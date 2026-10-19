import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import ProjectsView from '@/components/admin/views/projects';

export const metadata: Metadata = { title: 'Admin projects' };

export default async function Page() {
  await requireAdmin();
  return <ProjectsView />;
}
