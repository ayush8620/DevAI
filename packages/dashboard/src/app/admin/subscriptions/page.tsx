import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { SubscriptionsView } from '@/components/admin/views/subscriptions';
import { paymentsEnabled } from '@/lib/billing/razorpay';

export const metadata: Metadata = { title: 'Subscriptions' };

export default async function Page() {
  await requireAdmin();
  return <SubscriptionsView paymentsConfigured={paymentsEnabled()} />;
}
