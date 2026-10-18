import { paymentsEnabled, purchasablePlans } from '@/lib/billing/razorpay';
import { BillingView } from '@/components/billing/billing-view';

// Razorpay keys and plan ids are read at request time.
export const dynamic = 'force-dynamic';

export default function BillingPage() {
  return <BillingView paymentsEnabled={paymentsEnabled()} purchasable={purchasablePlans()} />;
}
