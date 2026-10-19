"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, ErrorBox, Loading, Notice, PageHeader, Stat, Table, btn, fmt, CHART } from '../ui';

export function OverviewView({ paymentsConfigured }: { paymentsConfigured: boolean }) {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); panelApi.getOverview().then(x => { setD(x); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const subs = d?.subscriptions;
  return (
    <>
      <PageHeader title="Overview" description="Users, plans, revenue and gateway traffic at a glance."
        actions={<button className={btn} onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>} />
      {error && <ErrorBox message={error} />}
      {d?.warnings?.map((w: string) => <Notice key={w}>{w}</Notice>)}
      {!d && loading ? <Loading /> : d && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total users" value={d.users.total == null ? '—' : fmt.n(d.users.total)} hint={d.users.suspended ? `${d.users.suspended} suspended` : 'none suspended'} />
            <Stat label="Paid plans" value={fmt.n(subs.active)} hint={`${subs.recurring} renewing · ${subs.bySource.comp} comp`} />
            <Stat label="MRR estimate" accent value={paymentsConfigured ? fmt.inr(d.mrrEstimatePaise) : '₹0'}
              hint={paymentsConfigured ? 'renewing Razorpay subscriptions (yearly ÷ 12)' : 'payments not configured'} />
            <Stat label="Error rate today" value={fmt.pct(d.usage.today.errorRate)} hint={`${fmt.n(d.usage.today.errors)} of ${fmt.n(d.usage.today.requests)} requests`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Active subscriptions by plan">
              <div className="space-y-3">
                {(['student', 'pro', 'team'] as const).map(p => {
                  const n = subs.byPlan[p];
                  const pct = subs.active ? Math.round((n / subs.active) * 100) : 0;
                  return (
                    <div key={p}>
                      <div className="flex justify-between text-sm"><span className="capitalize">{p}</span><span className="font-semibold">{fmt.n(n)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
                <p className="pt-1 text-xs text-muted-foreground">Monthly {subs.byPeriod.monthly} · yearly {subs.byPeriod.yearly}. Free = everyone else.</p>
                <Link href="/admin/subscriptions" className="text-xs font-medium text-primary hover:underline">All subscriptions</Link>
              </div>
            </Card>

            <Card title="Traffic" className="lg:col-span-2">
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Requests today</p><p className="text-lg font-bold">{fmt.n(d.usage.today.requests)}</p></div>
                <div><p className="text-xs text-muted-foreground">Tokens today</p><p className="text-lg font-bold">{fmt.n(d.usage.today.tokens)}</p></div>
                <div><p className="text-xs text-muted-foreground">Requests 7 days</p><p className="text-lg font-bold">{fmt.n(d.usage.week.requests)}</p></div>
                <div><p className="text-xs text-muted-foreground">Tokens 7 days</p><p className="text-lg font-bold">{fmt.n(d.usage.week.tokens)}</p></div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.usage.days} margin={{ left: -20, right: 4, top: 4 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} tick={{ fontSize: 11 }} stroke={CHART.grey} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke={CHART.grey} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar isAnimationActive={false} dataKey="requests" name="Requests" fill={CHART.accent} radius={[3, 3, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="errors" name="Errors" fill={CHART.ink} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">7-day error rate {fmt.pct(d.usage.week.errorRate)} · avg latency today {fmt.n(d.usage.today.avgLatencyMs)} ms</p>
            </Card>
          </div>

          <Card title="Recent signups" actions={<Link href="/admin/users" className="text-xs font-medium text-primary hover:underline">All users</Link>}>
            <Table head={['User', 'Plan', 'Joined']} empty={!d.users.recent.length && <Empty>No users yet.</Empty>}>
              {d.users.recent.map((u: any) => (
                <tr key={u.id}>
                  <td><Link href={`/admin/users/${encodeURIComponent(u.id)}`} className="font-medium hover:text-primary">{u.email || u.id}</Link>{u.name && <span className="ml-2 text-xs text-muted-foreground">{u.name}</span>}</td>
                  <td><Badge tone={u.plan === 'free' ? 'muted' : 'accent'}>{u.plan}</Badge></td>
                  <td className="text-muted-foreground">{fmt.ago(u.createdAt)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
