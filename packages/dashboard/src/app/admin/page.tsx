import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/gate';
import { OverviewView } from '@/components/admin/views/overview';
import { paymentsEnabled } from '@/lib/billing/razorpay';

export const metadata: Metadata = { title: { absolute: 'DevAI Admin' } };

export default async function Page() {
  await requireAdmin();
  // MRR shows ₹0 and "payments not configured" until the Razorpay keys are set on the dashboard.
  return <OverviewView paymentsConfigured={paymentsEnabled()} />;
}
