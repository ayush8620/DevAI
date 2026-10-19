"use client";
import { useEffect, useState } from 'react';
import { API_URL, getGatewayHealth } from '@/lib/api';
import { RefreshCw, Server, ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadHealth = () => {
    setRefreshing(true);
    getGatewayHealth()
      .then(setHealth)
      .catch(console.error)
      .finally(() => setRefreshing(false));
  };

  useEffect(() => { loadHealth(); }, []);

  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-4xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Gateway connection and service status.</p>
        </div>
        <button
          onClick={loadHealth}
          className="h-9 px-3 border rounded-lg text-xs font-medium inline-flex items-center gap-2 hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-6">
        {/* Gateway Endpoint */}
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Gateway Configuration
          </h2>
          <div className="divide-y text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-muted-foreground">API Base URL</span>
              <span className="ml-4 font-mono text-xs bg-muted px-2 py-0.5 rounded break-all text-right">{API_URL}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-muted-foreground">Auth Protocol</span>
              <span>Bearer Token (dvai_ prefix)</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-muted-foreground">Secret Encryption</span>
              <span>AES-256-GCM at rest</span>
            </div>
          </div>
        </div>

        {/* Live Infrastructure Health */}
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Infrastructure Status
          </h2>
          {health ? (
            <div className="divide-y text-sm">
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-muted-foreground">Gateway Status</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${health.status === 'healthy' ? 'bg-green-500/10 text-ok' : 'bg-amber-500/10 text-warn'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${health.status === 'healthy' ? 'bg-green-500' : 'bg-amber-500'}`} />
                  {health.status}
                </span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-muted-foreground">Neon PostgreSQL</span>
                <span className="font-medium text-ok">{health.database || 'Connected'}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-muted-foreground">Upstash Redis</span>
                <span className="font-medium text-ok">{health.redis || 'Connected'}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-muted-foreground">Process Uptime</span>
                <span className="font-mono text-xs">{Math.floor(health.uptime || 0)} seconds</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">Checking infrastructure health...</div>
          )}
        </div>
      </div>
    </div>
  );
}