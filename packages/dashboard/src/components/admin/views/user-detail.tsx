"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, CheckCircle2, Gift, Loader2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat, Table, btn, btnDanger, btnPrimary, field, fmt, statusTone, CHART } from '../ui';

export function UserDetailView({ userId }: { userId: string }) {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState({ plan: 'pro', period: 'monthly', days: '30', note: '' });
  const [reason, setReason] = useState('');

  const load = () => panelApi.getUser(userId).then(x => { setD(x); setError(null); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, [userId]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsg(null); setError(null);
    try { await fn(); setMsg(done); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const changePlan = async (force = false) => {
    const label = plan.plan === 'free' ? 'Free' : `${plan.plan} (${plan.period}) for ${plan.days} days`;
    if (!force && !confirm(`Set ${d.user.email || userId} to ${label}? This is written to the audit log.`)) return;
    setBusy(true); setMsg(null); setError(null);
    try {
      await panelApi.changePlan(userId, { plan: plan.plan, period: plan.period, days: Number(plan.days), note: plan.note || undefined, force });
      setMsg(`Plan set to ${label}.`);
      await load();
    } catch (e: any) {
      if (!force && /renewing Razorpay subscription/i.test(e.message) && confirm(`${e.message}\n\nOverwrite anyway?`)) { setBusy(false); return changePlan(true); }
      setError(e.message);
    } finally { setBusy(false); }
  };

  if (error && !d) return <><BackLink /><ErrorBox message={error} /></>;
  if (!d) return <><BackLink /><Loading /></>;
  const u = d.user;
  const suspended = d.account.status === 'suspended';
  const s = d.subscription;

  return (
    <>
      <BackLink />
      <PageHeader title={u.email || u.id} description={<span className="font-mono text-xs">{u.id}</span>}
        actions={<><Badge tone={u.plan === 'free' ? 'muted' : 'accent'}>{u.plan}</Badge><Badge tone={statusTone(d.account.status)}>{d.account.status}</Badge>{u.isAdmin && <Badge tone="accent">admin</Badge>}</>} />
      {error && <ErrorBox message={error} />}
      {msg && <div role="status" className="mb-4 rounded-xl border border-green-600/30 bg-green-500/5 p-3 text-sm text-ok">{msg}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-6">
        <Stat label="Requests (30d)" value={fmt.n(d.usage.last30.requests)} hint={`${fmt.n(d.usage.today.requests)} today`} />
        <Stat label="Tokens (30d)" value={fmt.n(d.usage.last30.tokens)} />
        <Stat label="Error rate (30d)" value={fmt.pct(d.usage.last30.errorRate)} />
        <Stat label="Joined" value={<span className="text-lg">{fmt.date(u.createdAt)}</span>} hint={`last active ${fmt.ago(u.lastActiveAt)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Subscription">
          {s ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Plan</dt><dd className="capitalize">{s.plan} · {s.period}</dd>
              <dt className="text-muted-foreground">Status</dt><dd><Badge tone={statusTone(s.status)}>{s.status}</Badge></dd>
              <dt className="text-muted-foreground">Source</dt><dd className="capitalize">{s.source}{s.compedBy ? ` by ${s.compedBy}` : ''}</dd>
              <dt className="text-muted-foreground">{s.renews ? 'Renews' : 'Ends'}</dt><dd>{fmt.date(s.expiresAt)}</dd>
              {s.subscriptionId && <><dt className="text-muted-foreground">Razorpay id</dt><dd className="font-mono text-xs">{s.subscriptionId}</dd></>}
              {s.coupon && <><dt className="text-muted-foreground">Code</dt><dd>{s.coupon}</dd></>}
              {s.lastPaymentError && <><dt className="text-muted-foreground">Last payment</dt><dd className="text-bad">{s.lastPaymentError}</dd></>}
            </dl>
          ) : <p className="text-sm text-muted-foreground">Free plan (no billing record).</p>}

          <div className="mt-5 border-t pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Gift className="h-4 w-4 text-primary" /> Change plan manually (comp)</h3>
            <p className="mb-3 text-xs text-muted-foreground">Gives the plan without payment until the end date. It does not renew and shows no Cancel button; a later purchase starts after it.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select aria-label="Plan" className={field} value={plan.plan} onChange={e => setPlan({ ...plan, plan: e.target.value })}>
                {['free', 'student', 'pro', 'team'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
              <select aria-label="Period" className={field} value={plan.period} disabled={plan.plan === 'free'} onChange={e => setPlan({ ...plan, period: e.target.value, days: e.target.value === 'yearly' ? '365' : '30' })}>
                <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
              </select>
              <input aria-label="Days" type="number" min={1} max={3660} className={field} value={plan.days} disabled={plan.plan === 'free'} onChange={e => setPlan({ ...plan, days: e.target.value })} />
              <button className={btnPrimary + ' h-9 justify-center'} disabled={busy} onClick={() => changePlan()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Apply</button>
            </div>
            <input aria-label="Note" className={`${field} mt-2 w-full`} placeholder="Note for the audit log (optional)" value={plan.note} onChange={e => setPlan({ ...plan, note: e.target.value })} maxLength={300} />
          </div>
        </Card>

        <Card title="Account">
          {suspended ? (
            <div className="space-y-3 text-sm">
              <p><Badge tone="bad">suspended</Badge> <span className="ml-2 text-muted-foreground">{fmt.dateTime(d.account.suspendedAt)} by {d.account.suspendedBy}</span></p>
              {d.account.suspendedReason && <p className="text-muted-foreground">Reason: {d.account.suspendedReason}</p>}
              <p className="text-xs text-muted-foreground">The gateway answers 403 to this user&rsquo;s dashboard calls and to every request made with their pool or kit keys.</p>
              <button className={btn} disabled={busy} onClick={() => act(() => panelApi.unsuspendUser(userId), 'Account unsuspended.')}><CheckCircle2 className="h-3.5 w-3.5" /> Unsuspend</button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Suspending blocks the user&rsquo;s dashboard API calls and all requests with their pool and kit keys (403). Their keys and data are kept.</p>
              <input aria-label="Suspension reason" className={`${field} w-full`} placeholder="Reason (shown in the audit log)" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} />
              <button className={btnDanger} disabled={busy || u.isAdmin} title={u.isAdmin ? 'Admins cannot be suspended' : undefined}
                onClick={() => confirm(`Suspend ${u.email || userId}?`) && act(() => panelApi.suspendUser(userId, reason || undefined), 'Account suspended.')}>
                <Ban className="h-3.5 w-3.5" /> Suspend
              </button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Requests per day (30 days)" className="mt-6">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.usage.days} margin={{ left: -20, right: 4, top: 4 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} tick={{ fontSize: 11 }} stroke={CHART.grey} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke={CHART.grey} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="requests" name="Requests" stroke={CHART.accent} fill={CHART.accent} fillOpacity={0.15} />
              <Area type="monotone" dataKey="errors" name="Errors" stroke={CHART.ink} fill={CHART.ink} fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {d.usage.models.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Top models: {d.usage.models.slice(0, 5).map((m: any) => `${m.model} (${fmt.n(m.requestCount)})`).join(', ')}</p>}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Provider keys (BYOK) · ${d.byokKeys.length}`}>
          <Table head={['Key', 'Provider', 'Status', 'Added']} empty={!d.byokKeys.length && <Empty>No provider keys.</Empty>}>
            {d.byokKeys.map((k: any) => (
              <tr key={k.id}>
                <td><span className="font-medium">{k.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{k.key}</span></td>
                <td>{k.provider}</td>
                <td><Badge tone={statusTone(k.status === 'active' && !k.enabled ? 'disabled' : k.status)}>{k.status === 'active' && !k.enabled ? 'disabled' : k.status}</Badge></td>
                <td className="text-muted-foreground">{fmt.date(k.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`Projects and API keys · ${d.projects.length}`}>
          {!d.projects.length ? <Empty>No projects yet.</Empty> : (
            <div className="space-y-4">
              {d.projects.map((p: any) => (
                <div key={p.id}>
                  <p className="text-sm font-medium">{p.name} <Badge>{p.kind}</Badge> <Badge tone={statusTone(p.status)}>{p.status}</Badge></p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {p.apiKeys.length ? p.apiKeys.map((k: any) => (
                      <li key={k.id} className="flex flex-wrap items-center gap-2"><span className="font-mono">{k.key}</span><span className="text-muted-foreground">{k.name}</span><Badge tone={statusTone(k.status)}>{k.status}</Badge><span className="text-muted-foreground">used {fmt.ago(k.lastUsedAt)}</span></li>
                    )) : <li className="text-muted-foreground">No API keys</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {d.kits.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Kits: {d.kits.map((k: any) => `${k.name} (${k.status}, ${k.keyCount} keys)`).join(', ')}</p>}
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted-foreground"><Link href={`/admin/audit?resourceId=${encodeURIComponent(userId)}`} className="text-primary hover:underline">Audit log for this user</Link></p>
    </>
  );
}

function BackLink() {
  return <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Users</Link>;
}
