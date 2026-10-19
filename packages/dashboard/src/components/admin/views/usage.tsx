"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart } from 'recharts';
import { panelApi, type Period } from '@/lib/admin-api';
import { Card, Empty, ErrorBox, Loading, PageHeader, Table, fmt, CHART } from '../ui';

const tooltip = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

export function UsageView() {
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState<Period>('week');
  const [byDay, setByDay] = useState<any[] | null>(null);
  const [rest, setRest] = useState<{ models: any[]; providers: any[]; top: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { panelApi.getUsageByDay(days).then(setByDay).catch(e => setError(e.message)); }, [days]);
  useEffect(() => {
    setRest(null);
    Promise.all([panelApi.getUsageByModel(period), panelApi.getUsageByProvider(period), panelApi.getTopUsers(period, 15)])
      .then(([models, providers, top]) => setRest({ models, providers, top })).catch(e => setError(e.message));
  }, [period]);

  return (
    <>
      <PageHeader title="Usage" description="Gateway-wide traffic: every user's pool and kit requests plus the admin projects." />
      {error && <ErrorBox message={error} />}
      <Card title="Requests, errors and tokens per day" actions={
        <div className="inline-flex rounded-md border p-0.5 text-xs">{[7, 30, 90].map(n => <button key={n} onClick={() => setDays(n)} className={`rounded px-2.5 py-1 ${days === n ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>{n}d</button>)}</div>
      }>
        {!byDay ? <Loading /> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={byDay} margin={{ left: -10, right: 0, top: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} tick={{ fontSize: 11 }} stroke={CHART.grey} />
                <YAxis yAxisId="r" allowDecimals={false} tick={{ fontSize: 11 }} stroke={CHART.grey} />
                <YAxis yAxisId="t" orientation="right" tick={{ fontSize: 11 }} stroke={CHART.grey} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip contentStyle={tooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} yAxisId="r" dataKey="requests" name="Requests" fill={CHART.accent} radius={[3, 3, 0, 0]} />
                <Bar isAnimationActive={false} yAxisId="r" dataKey="errors" name="Errors" fill={CHART.ink} radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="t" type="monotone" dataKey="tokens" name="Tokens" stroke={CHART.grey} dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="my-6 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Breakdowns for</span>
        <div className="inline-flex rounded-md border p-0.5">{(['today', 'week', 'month'] as const).map(p => <button key={p} onClick={() => setPeriod(p)} className={`rounded px-2.5 py-1 ${period === p ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>{p === 'today' ? 'Today' : p === 'week' ? '7 days' : '30 days'}</button>)}</div>
      </div>

      {!rest ? <Loading /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="By model">
            {!rest.models.length ? <Empty>No traffic in this period.</Empty> : (
              <div style={{ height: Math.max(160, rest.models.slice(0, 10).length * 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rest.models.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid stroke={CHART.grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke={CHART.grey} />
                    <YAxis type="category" dataKey="model" width={150} tick={{ fontSize: 11 }} stroke={CHART.grey} />
                    <Tooltip contentStyle={tooltip} />
                    <Bar isAnimationActive={false} dataKey="requestCount" name="Requests" fill={CHART.accent} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <Card title="By provider">
            <Table head={['Provider', 'Kind', 'Requests', 'Tokens', 'Errors']} empty={!rest.providers.length && <Empty>No traffic in this period.</Empty>}>
              {rest.providers.map((p: any) => (
                <tr key={p.key}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-xs text-muted-foreground">{p.shared ? 'shared' : p.type ? 'BYOK' : '—'}</td>
                  <td className="tabular-nums">{fmt.n(p.requestCount)}</td>
                  <td className="tabular-nums">{fmt.n(p.totalTokens)}</td>
                  <td className="tabular-nums">{fmt.n(p.errors)}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Top users" className="lg:col-span-2">
            <Table head={['User', 'Requests', 'Tokens', 'Errors', 'Error rate']} empty={!rest.top.length && <Empty>No user traffic in this period.</Empty>}>
              {rest.top.map((u: any) => (
                <tr key={u.userId}>
                  <td><Link href={`/admin/users/${encodeURIComponent(u.userId)}`} className="font-medium hover:text-primary">{u.email || u.userId}</Link></td>
                  <td className="tabular-nums">{fmt.n(u.requests)}</td>
                  <td className="tabular-nums">{fmt.n(u.tokens)}</td>
                  <td className="tabular-nums">{fmt.n(u.errors)}</td>
                  <td className="tabular-nums">{u.requests ? fmt.pct(Math.round((u.errors / u.requests) * 10000) / 100) : '0%'}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
