"use client";
import { useEffect, useState } from 'react';
import { Loader2, Plus, Ticket, ShieldAlert } from 'lucide-react';
import { adminApi as api } from '@/lib/admin-api';
import { PAID_PLAN_IDS, getPlan } from '@/lib/billing/plans';

interface Coupon {
  id: string; code: string; kind: 'percent' | 'flat'; percentOff: number | null; amountOffPaise: number | null;
  plans: string[]; periods: string[]; duration: 'first_cycle' | 'forever'; expiresAt: string | null;
  maxRedemptions: number | null; oncePerUser: boolean; razorpayOfferId: string | null; redemptionCount: number;
  confirmedCount: number; reservedCount: number; status: 'active' | 'disabled'; note: string | null; createdAt: string;
}

const empty = { code: '', kind: 'percent', value: '', plans: [] as string[], periods: [] as string[], duration: 'first_cycle', expiresAt: '', maxRedemptions: '', oncePerUser: true, razorpayOfferId: '', note: '' };
const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm';

function toggle(list: string[], v: string) { return list.includes(v) ? list.filter(x => x !== v) : [...list, v]; }

/** Admin-only: create, list and disable promo codes. The gateway refuses non-admins. */
export default function CouponsPage() {
  const [list, setList] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toast = { success: (text: string) => setMsg({ ok: true, text }), error: (text: string) => setMsg({ ok: false, text }) };

  const load = () => api.getCoupons().then((d: Coupon[]) => { setList(d); setError(null); }).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createCoupon({
        code: form.code, kind: form.kind,
        ...(form.kind === 'percent' ? { percentOff: Number(form.value) } : { amountOffInr: Number(form.value) }),
        plans: form.plans, periods: form.periods, duration: form.duration,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        oncePerUser: form.oncePerUser, razorpayOfferId: form.razorpayOfferId || undefined, note: form.note || undefined,
      });
      toast.success(`Code ${form.code.toUpperCase()} created`);
      setForm(empty);
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const setStatus = async (c: Coupon, status: 'active' | 'disabled') => {
    try { await api.updateCoupon(c.id, { status }); load(); } catch (err: any) { toast.error(err.message); }
  };

  if (error && !list) {
    return (
      <div>
        <h1>Promo codes</h1>
        <div className="mt-6 flex gap-3 rounded-xl border border-amber-600/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>Only gateway admins can manage promo codes. ({error})</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Promo codes</h1>
        <p className="mt-1 text-muted-foreground">Discounts customers enter under &ldquo;Have a code?&rdquo; at checkout. Checked and counted on the gateway, so limits hold even with many checkouts at once.</p>
      </div>

      <form onSubmit={create} className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
        <h2 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-primary" /> New code</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Code</span>
            <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LAUNCH20" maxLength={32} className={`${input} uppercase`} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Type</span>
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={input}>
              <option value="percent">Percent off</option><option value="flat">Flat ₹ off</option>
            </select></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">{form.kind === 'percent' ? 'Percent (1-90)' : 'Rupees off'}</span>
            <input required type="number" min={1} max={form.kind === 'percent' ? 90 : undefined} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className={input} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Applies to</span>
            <select value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} className={input}>
              <option value="first_cycle">First payment only</option><option value="forever">Every payment</option>
            </select></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Expires (optional)</span>
            <input type="datetime-local" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className={input} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Max redemptions (optional)</span>
            <input type="number" min={1} value={form.maxRedemptions} onChange={e => setForm({ ...form, maxRedemptions: e.target.value })} className={input} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Razorpay offer id (optional)</span>
            <input value={form.razorpayOfferId} onChange={e => setForm({ ...form, razorpayOfferId: e.target.value.trim() })} placeholder="offer_..." className={input} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Note (optional)</span>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} maxLength={200} className={input} /></label>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <fieldset className="flex flex-wrap items-center gap-3"><legend className="sr-only">Plans</legend><span className="text-muted-foreground">Plans:</span>
            {PAID_PLAN_IDS.map(p => (
              <label key={p} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={form.plans.includes(p)} onChange={() => setForm({ ...form, plans: toggle(form.plans, p) })} className="accent-[hsl(var(--primary))]" />{getPlan(p)?.name}</label>
            ))}<span className="text-xs text-muted-foreground">(none = all)</span>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-3"><legend className="sr-only">Billing periods</legend><span className="text-muted-foreground">Billing:</span>
            {['monthly', 'yearly'].map(p => (
              <label key={p} className="inline-flex items-center gap-1.5 capitalize"><input type="checkbox" checked={form.periods.includes(p)} onChange={() => setForm({ ...form, periods: toggle(form.periods, p) })} className="accent-[hsl(var(--primary))]" />{p}</label>
            ))}<span className="text-xs text-muted-foreground">(none = both)</span>
          </fieldset>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={form.oncePerUser} onChange={e => setForm({ ...form, oncePerUser: e.target.checked })} className="accent-[hsl(var(--primary))]" />Once per user</label>
        </div>
        <p className="text-xs text-muted-foreground">
          First-payment codes charge the discounted first period upfront and start full-price billing one period later. Every-payment codes subscribe the customer to a discounted Razorpay plan. With a Razorpay offer id, Razorpay applies that offer instead (set the same terms there). Codes cannot bring a price below ₹1 or exceed 90% off.
        </p>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Create code
        </button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-ok' : 'text-destructive'}`}>{msg.text}</p>}
      </form>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left">
            <th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Scope</th>
            <th className="px-4 py-3">Used</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className="divide-y">
            {!list && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
            {list?.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground"><Ticket className="mx-auto mb-2 h-5 w-5" />No codes yet.</td></tr>}
            {list?.map(c => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono font-semibold">{c.code}{c.note && <div className="font-sans text-xs font-normal text-muted-foreground">{c.note}</div>}</td>
                <td className="px-4 py-3">{c.kind === 'percent' ? `${c.percentOff}% off` : `₹${(c.amountOffPaise ?? 0) / 100} off`}<div className="text-xs text-muted-foreground">{c.duration === 'forever' ? 'every payment' : 'first payment'}{c.razorpayOfferId ? ` · ${c.razorpayOfferId}` : ''}</div></td>
                <td className="px-4 py-3 text-muted-foreground">{c.plans.length ? c.plans.join(', ') : 'all plans'} · {c.periods.length ? c.periods.join(', ') : 'monthly + yearly'}{c.oncePerUser ? ' · once per user' : ''}</td>
                <td className="px-4 py-3">{c.confirmedCount}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}{c.reservedCount > 0 && <div className="text-xs text-muted-foreground">{c.reservedCount} in checkout</div>}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.expiresAt ? new Date(c.expiresAt + (c.expiresAt.endsWith('Z') ? '' : 'Z')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}</td>
                <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.status === 'active' ? 'border-green-600/30 bg-green-600/10 text-ok' : 'bg-muted text-muted-foreground'}`}>{c.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => setStatus(c, c.status === 'active' ? 'disabled' : 'active')} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    {c.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
