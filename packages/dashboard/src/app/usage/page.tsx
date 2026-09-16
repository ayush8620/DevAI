"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BarChart3, Layers, Box, FolderKanban, Activity, Database, Clock } from 'lucide-react';

export default function UsagePage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [byProvider, setByProvider] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [byProject, setByProject] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getOverview().catch(() => null),
      api.getAnalyticsByProvider(period).catch(() => []),
      api.getAnalyticsByModel(period).catch(() => []),
      api.getAnalyticsByProject(period).catch(() => []),
    ]).then(([o, p, m, proj]) => {
      setOverview(o);
      setByProvider(p);
      setByModel(m);
      setByProject(proj);
      setLoading(false);
    });
  }, [period]);

  const stats = period === 'today' ? overview?.today : period === 'week' ? overview?.week : overview?.month;

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage & Analytics</h1>
          <p className="text-muted-foreground mt-1">Track request volume, token consumption, and cache hit metrics.</p>
        </div>

        {/* Period Selector Tabs */}
        <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
          {(['today', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${period === p ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Aggregate Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase">Requests</span>
            <Activity className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">
            {loading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : (stats?.requestCount || 0).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total API calls</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase">Tokens</span>
            <Layers className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">
            {loading ? <div className="h-7 w-20 bg-muted animate-pulse rounded" /> : (stats?.totalTokens || 0).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Input + output tokens</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase">Cache Hit Rate</span>
            <Database className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">
            {loading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : `${stats?.cacheHitRate || 0}%`}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Saved from cloud providers</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase">Avg Latency</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">
            {loading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : `${stats?.avgLatencyMs || 0}ms`}
          </div>
          <p className="text-xs text-muted-foreground mt-1">End-to-end response time</p>
        </div>
      </div>

      {/* Breakdowns Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* By Provider */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            Usage by Provider
          </h2>
          {loading ? (
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          ) : byProvider.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No provider usage recorded in this period.</p>
          ) : (
            <div className="space-y-3">
              {byProvider.map((p, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/40">
                  <span className="font-medium font-mono text-xs">{p.providerId || 'Auto/Cache'}</span>
                  <div className="text-right">
                    <span className="font-bold">{p.requestCount}</span>
                    <span className="text-xs text-muted-foreground ml-1">reqs</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">({(p.totalTokens || 0).toLocaleString()} tok)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Model */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Usage by Model
          </h2>
          {loading ? (
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          ) : byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No model usage recorded in this period.</p>
          ) : (
            <div className="space-y-3">
              {byModel.map((m, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/40">
                  <span className="font-medium font-mono text-xs">{m.model}</span>
                  <div className="text-right">
                    <span className="font-bold">{m.requestCount}</span>
                    <span className="text-xs text-muted-foreground ml-1">reqs</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">({(m.totalTokens || 0).toLocaleString()} tok)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Project */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4 md:col-span-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            Usage by Project
          </h2>
          {loading ? (
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          ) : byProject.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No project usage recorded in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-2 text-left">Project Name</th>
                    <th className="py-2 text-left">Project ID</th>
                    <th className="py-2 text-right">Requests</th>
                    <th className="py-2 text-right">Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((proj) => (
                    <tr key={proj.projectId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-semibold">{proj.projectName}</td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">{proj.projectId}</td>
                      <td className="py-3 text-right font-medium">{proj.requestCount.toLocaleString()}</td>
                      <td className="py-3 text-right font-mono">{proj.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}