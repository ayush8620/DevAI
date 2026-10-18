import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { CURRENCY, getPlan, isPaidPlan, isStudentEmail, planAmountPaise } from '@/lib/billing/plans';
import { createOrder, paymentsEnabled, publicKeyId } from '@/lib/billing/razorpay';
import { verifiedEmails } from '@/lib/billing/server';

export const dynamic = 'force-dynamic';

/** POST { planId } → a Razorpay order for the signed-in user. The amount comes from the plan config only. */
export async function POST(req: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: { type: 'payments_disabled', message: 'Payments are coming soon.' } }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: { type: 'authentication_error', message: 'Sign in to upgrade.' } }, { status: 401 });
  }

  let planId: unknown;
  try { planId = (await req.json())?.planId; } catch { /* handled below */ }
  const plan = getPlan(planId);
  if (!plan || !isPaidPlan(plan.id)) {
    return NextResponse.json({ error: { type: 'invalid_request', message: 'Choose a paid plan.' } }, { status: 400 });
  }

  try {
    if (plan.studentOnly) {
      const emails = await verifiedEmails(userId);
      if (!emails.some(isStudentEmail)) {
        return NextResponse.json({
          error: { type: 'student_email_required', message: 'The Student plan needs a verified college email (.edu or .ac.in). Add one to your account first.' },
        }, { status: 403 });
      }
    }
    const amount = planAmountPaise(plan.id);
    const order = await createOrder({
      amount,
      currency: CURRENCY,
      receipt: `devai_${plan.id}_${Date.now()}`.slice(0, 40),
      notes: { userId, planId: plan.id },
    });
    return NextResponse.json({
      orderId: order.id, amount: order.amount, currency: order.currency, keyId: publicKeyId(),
      plan: { id: plan.id, name: plan.name },
    });
  } catch (err: any) {
    console.error('Razorpay order failed:', err?.message);
    return NextResponse.json({ error: { type: 'payment_error', message: 'Could not start the payment. Please try again.' } }, { status: 502 });
  }
}
