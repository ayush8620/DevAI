"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Zap, AlertTriangle, Clock, BookOpen, KeyRound, ArrowRight } from 'lucide-react';
import { userApi } from '@/lib/api';
import { clerkEnabled } from '@/lib/clerk';
import { ByokOnboarding } from '@/components/byok/onboarding';

/** Health of the signed-in user's own provider keys (bring your own key). */
function KeyHealthCard({ pool }: { pool: any }) {
  const keys: any[] = pool?.keys ?? [];
  const count = (h: string) => keys.filter(k => k.health === h).length;
  const items = [
    { label: 'Healthy', n: count('healthy') + count('unused'), cls: 'text-ok' },
    { label: 'Cooling down', n: count('cooling_down') + count('quota_exhausted'), cls: 'text-warn' },
    { label: 'Error', n: count('error'), cls: 'text-bad' },
    { label: 'Disabled', n: count('disabled'), cls: 'text-muted-foreground' },
  ];
  const providers = Array.from(new Set(keys.map(k => String(k.providerName))));
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-4 w-4" /></span>
          <div>
            <h3 className="font-semibold leading-none tracking-tight">Your provider keys</h3>
            <p className="mt-1 text-xs text-muted-foreground">{keys.length} key{keys.length === 1 ? '' : 's'}{providers.length ? ` · ${providers.join(', ')}` : ''} · your requests use only these</p>
          </div>
        </div>
        <Link href="/dashboard/pool" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Manage <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(i => (
          <div key={i.label} className="rounded-lg border bg-background/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{i.label}</p>
            <p className={`text-xl font-bold ${i.cls}`}>{i.n}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function Dashboard() {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(clerkEnabled);
  const [pool, setPool] = useState<any>(null);

  useEffect(() => {
    if (!clerkEnabled) return;
    // Your own keys, onboarding and today's traffic on them (never anybody else's).
    userApi.getPool().then(setPool).catch(() => {});
    userApi.getUsage('today').then(setUsage).catch(() => setUsage(null)).finally(() => setLoading(false));
  }, []);
  const today = usage?.today;
  const requests: any[] = usage?.recent ?? [];

  return (
    <div className="p-5 sm:p-8 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Your provider keys, today&rsquo;s requests on them and your latest calls.</p>
        </div>
        <Link href="/docs" className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg border bg-card px-3.5 py-2 text-sm font-medium hover:bg-muted transition-colors">
          <BookOpen className="h-4 w-4" /> API docs
        </Link>
      </div>

      {pool?.onboarding && <ByokOnboarding nextStep={pool.onboarding.nextStep} />}
      {pool && pool.keys?.length > 0 && <KeyHealthCard pool={pool} />}

      {(usage || loading) && <>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {[ 
          { title: 'Requests Today', value: today?.requests?.toLocaleString(), icon: Activity },
          { title: 'Tokens Today', value: today?.tokens?.toLocaleString(), icon: Zap },
          { title: 'Error Rate', value: `${today?.errorRate ?? 0}%`, icon: AlertTriangle },
          { title: 'Avg Latency', value: `${today?.avgLatencyMs ?? 0}ms`, icon: Clock }
        ].map((stat, i) => (
          <div key={i} className="rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:border-primary/50">
            <div className="p-4 sm:p-6 flex flex-row items-center justify-between gap-2 pb-3">
              <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{stat.title}</h3>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><stat.icon className="h-4 w-4" /></span>
            </div>
            <div className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loading ? <div className="h-8 w-20 bg-muted animate-pulse rounded" /> : <div className="text-2xl sm:text-3xl font-bold tracking-tight">{stat.value || 0}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="p-6 flex items-center justify-between">
          <h3 className="font-semibold leading-none tracking-tight">Your recent requests</h3>
          <Link href="/dashboard/usage" className="text-xs font-medium text-primary hover:underline">View usage</Link>
        </div>
        <div className="p-6 pt-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Model</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Latency</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tokens</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Cache</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b transition-colors"><td colSpan={6} className="p-4"><div className="h-6 w-full bg-muted animate-pulse rounded" /></td></tr>
                  ))
                ) : requests.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No requests yet. Create an API key under Your keys and call the gateway.</td></tr>
                ) : (
                  requests.map((r: any) => (
                    <tr key={r.requestId} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</td>
                      <td className="p-4 align-middle">{r.model}</td>
                      <td className="p-4 align-middle"><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${r.status < 400 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{r.status}</span></td>
                      <td className="p-4 align-middle">{r.latencyMs}ms</td>
                      <td className="p-4 align-middle">{r.totalTokens}</td>
                      <td className="p-4 align-middle"><span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">{r.cacheHit ? 'Hit' : 'Miss'}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}