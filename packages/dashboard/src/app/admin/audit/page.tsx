import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { AuditView } from '@/components/admin/views/audit';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Page() {
  await requireAdmin();
  return <Suspense><AuditView /></Suspense>;
}
