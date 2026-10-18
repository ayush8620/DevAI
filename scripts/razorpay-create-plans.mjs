#!/usr/bin/env node
/**
 * Create the DevAI subscription plans in Razorpay and print the env vars to set.
 *
 *   RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... node scripts/razorpay-create-plans.mjs
 *   node scripts/razorpay-create-plans.mjs --dry-run      # print what would be created
 *
 * Creates 6 plans (Student / Pro / Team x monthly / yearly). Razorpay plans cannot be edited
 * or deleted, so the script first lists existing plans and reuses one whose notes match
 * (devai_plan + devai_period) and whose amount is unchanged. Test-mode and live-mode keys
 * have separate plans: run it once with each.
 * Prices must match packages/dashboard/src/lib/billing/plans.ts (a unit test checks this).
 */

export const PLAN_DEFS = [
  { plan: 'student', name: 'Student', period: 'monthly', amountPaise: 9_900 },
  { plan: 'student', name: 'Student', period: 'yearly', amountPaise: 99_000 },
  { plan: 'pro', name: 'Pro', period: 'monthly', amountPaise: 49_900 },
  { plan: 'pro', name: 'Pro', period: 'yearly', amountPaise: 499_000 },
  { plan: 'team', name: 'Team', period: 'monthly', amountPaise: 199_900 },
  { plan: 'team', name: 'Team', period: 'yearly', amountPaise: 1_999_000 },
];

export const envVarFor = (d) => `RAZORPAY_PLAN_ID_${d.plan.toUpperCase()}${d.period === 'yearly' ? '_YEARLY' : ''}`;

async function main() {
  const dry = process.argv.includes('--dry-run');
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (dry || !keyId || !keySecret) {
    if (!dry) console.error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set: showing what would be created (nothing was sent).\n');
    for (const d of PLAN_DEFS) console.log(`${envVarFor(d).padEnd(30)} DevAI ${d.name} (${d.period}) ₹${(d.amountPaise / 100).toLocaleString('en-IN')}`);
    process.exit(dry ? 0 : 1);
  }
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const api = async (path, init = {}) => {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, { ...init, headers: { Authorization: auth, 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.description || `Razorpay ${res.status}`);
    return body;
  };

  const existing = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await api(`/plans?count=100&skip=${skip}`);
    existing.push(...(page.items || []));
    if (!page.items || page.items.length < 100) break;
  }

  console.log(`# Razorpay plans for ${keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST'} mode. Add these to the dashboard env (Vercel):`);
  for (const d of PLAN_DEFS) {
    const found = existing.find(p => p.notes?.devai_plan === d.plan && p.notes?.devai_period === d.period
      && p.item?.amount === d.amountPaise && p.item?.currency === 'INR' && p.interval === 1 && p.period === d.period);
    const plan = found ?? await api('/plans', {
      method: 'POST',
      body: JSON.stringify({
        period: d.period, interval: 1,
        item: { name: `DevAI ${d.name} (${d.period})`, amount: d.amountPaise, currency: 'INR', description: `DevAI ${d.name} plan, billed ${d.period}` },
        notes: { devai_plan: d.plan, devai_period: d.period },
      }),
    });
    console.log(`${envVarFor(d)}=${plan.id}${found ? '   # existing' : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
}
