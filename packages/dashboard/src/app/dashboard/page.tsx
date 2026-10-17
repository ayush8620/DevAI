"use client";
import { useEffect, useState } from 'react';
import { Activity, Zap, Database, Clock } from 'lucide-react';
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
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[ 
          { title: 'Requests Today', value: overview?.requestsToday, icon: Activity },
          { title: 'Tokens Today', value: overview?.tokensToday, icon: Zap },
          { title: 'Cache Hit Rate', value: overview?.cacheHitRate ? `${overview.cacheHitRate}%` : '0%', icon: Database },
          { title: 'Avg Latency', value: overview?.avgLatencyMs ? `${overview.avgLatencyMs}ms` : '0ms', icon: Clock }
        ].map((stat, i) => (
          <div key={i} className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 flex flex-row items-center justify-between pb-2">
              <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{stat.title}</h3>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-6 pt-0">
              {loading ? <div className="h-8 w-20 bg-muted animate-pulse rounded" /> : <div className="text-2xl font-bold">{stat.value || 0}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6">
          <h3 className="font-semibold leading-none tracking-tight">Recent Requests</h3>
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