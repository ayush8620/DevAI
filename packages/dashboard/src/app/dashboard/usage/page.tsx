"use client";
import { useEffect, useState } from 'react';
import { userApi } from '@/lib/api';
import { clerkEnabled } from '@/lib/clerk';
import { Layers, Box, Activity, AlertTriangle, Clock, CalendarDays } from 'lucide-react';

/** The signed-in user's own traffic: their key pool and their hackathon kits (GET /user/usage). */
export default function UsagePage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clerkEnabled) { setLoading(false); setError('Sign-in is not configured for this dashboard.'); return; }
    setLoading(true);
    userApi.getUsage(period).then(d => { setData(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [period]);

  const s = data?.summary;
  const days: any[] = data?.days ?? [];
  const peak = Math.max(1, ...days.map(d => d.requests));
  const card = 'rounded-xl border bg-card p-6 shadow-sm';
  const stat = (label: string, value: React.ReactNode, hint: string, Icon: any) => (
    <div className={card}>
      <div className="flex items-center justify-between text-muted-foreground mb-2"><span className="text-xs font-medium uppercase">{label}</span><Icon className="h-4 w-4" /></div>
      <div className="text-2xl font-bold">{loading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : value}</div>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );

  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage</h1>
          <p className="text-muted-foreground mt-1">Requests made with your API keys and your hackathon kits, on your own provider keys.</p>
        </div>
        <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
              {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 days' : 'Last 30 days'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-bad"><AlertTriangle className="h-4 w-4 mt-0.5" />{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stat('Requests', (s?.requests || 0).toLocaleString(), 'API calls in this period', Activity)}
        {stat('Tokens', (s?.tokens || 0).toLocaleString(), 'Input + output tokens', Layers)}
        {stat('Error rate', `${s?.errorRate || 0}%`, `${(s?.errors || 0).toLocaleString()} failed calls`, AlertTriangle)}
        {stat('Avg latency', `${s?.avgLatencyMs || 0}ms`, 'End-to-end response time', Clock)}
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><CalendarDays className="h-5 w-5 text-primary" /> Requests per day</h2>
        {loading ? <div className="h-32 bg-muted animate-pulse rounded-lg" /> : (
          <div className="flex h-32 items-end gap-1" role="img" aria-label="Requests per day">
            {days.map(d => (
              <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.requests} requests, ${d.errors} errors`}>
                <div className="rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(2, (d.requests / peak) * 120)}px` }} />
              </div>
            ))}
          </div>
        )}
        {!loading && days.length > 0 && <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{days[0].date}</span><span>{days[days.length - 1].date}</span></div>}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { title: 'By provider', icon: Box, rows: (data?.byProvider ?? []).map((p: any) => ({ k: p.name, n: p.requestCount, t: p.totalTokens })) },
          { title: 'By model', icon: Layers, rows: (data?.byModel ?? []).map((m: any) => ({ k: m.model, n: m.requestCount, t: m.totalTokens })) },
        ].map(b => (
          <div key={b.title} className={`${card} space-y-4`}>
            <h2 className="text-lg font-semibold flex items-center gap-2"><b.icon className="h-5 w-5 text-primary" /> {b.title}</h2>
            {loading ? <div className="h-32 bg-muted animate-pulse rounded-lg" /> : b.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No usage in this period.</p>
            ) : (
              <div className="space-y-3">
                {b.rows.map((r: any) => (
                  <div key={r.k} className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/40">
                    <span className="font-medium font-mono text-xs">{r.k}</span>
                    <div className="text-right">
                      <span className="font-bold">{r.n.toLocaleString()}</span><span className="text-xs text-muted-foreground ml-1">reqs</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">({r.t.toLocaleString()} tok)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
