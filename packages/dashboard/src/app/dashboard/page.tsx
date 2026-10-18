"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Zap, Database, Clock, BookOpen } from 'lucide-react';
import { api } from '@/lib/api';

export default function Dashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOverview().catch(() => ({ requestsToday: 0, tokensToday: 0, cacheHitRate: 0, avgLatencyMs: 0 })),
      api.getRecentRequests().catch(() => [])
    ]).then(([o, r]) => {
      setOverview(o);
      setRequests(r);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-5 sm:p-8 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Today&apos;s traffic through the gateway and the latest requests.</p>
        </div>
        <Link href="/docs" className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg border bg-card px-3.5 py-2 text-sm font-medium hover:bg-muted transition-colors">
          <BookOpen className="h-4 w-4" /> API docs
        </Link>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {[ 
          { title: 'Requests Today', value: overview?.requestsToday, icon: Activity },
          { title: 'Tokens Today', value: overview?.tokensToday, icon: Zap },
          { title: 'Cache Hit Rate', value: overview?.cacheHitRate ? `${overview.cacheHitRate}%` : '0%', icon: Database },
          { title: 'Avg Latency', value: overview?.avgLatencyMs ? `${overview.avgLatencyMs}ms` : '0ms', icon: Clock }
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
          <h3 className="font-semibold leading-none tracking-tight">Recent Requests</h3>
          <Link href="/dashboard/usage" className="text-xs font-medium text-primary hover:underline">View usage</Link>
        </div>
        <div className="p-6 pt-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Model</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Provider</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Latency</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tokens</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Cache</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b transition-colors"><td colSpan={7} className="p-4"><div className="h-6 w-full bg-muted animate-pulse rounded" /></td></tr>
                  ))
                ) : requests.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">No recent requests</td></tr>
                ) : (
                  requests.map((r: any) => (
                    <tr key={r.requestId} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</td>
                      <td className="p-4 align-middle">{r.model}</td>
                      <td className="p-4 align-middle">{r.provider}</td>
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
    </div>
  );
}