import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import CouponsView from '@/components/admin/views/coupons';

export const metadata: Metadata = { title: 'Promo codes' };

export default async function Page() {
  await requireAdmin();
  return <CouponsView />;
}
