"use client";
import { useEffect, useState } from 'react';
import { api, API_URL, getAdminKey, setAdminKey } from '@/lib/api';
import { RefreshCw, Server, ShieldCheck, Key, Check } from 'lucide-react';

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [savedKey, setSavedKey] = useState(false);

  const loadHealth = () => {
    setRefreshing(true);
    api.getHealth()
      .then(setHealth)
      .catch(console.error)
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    loadHealth();
    setAdminKeyInput(getAdminKey());
  }, []);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminKey(adminKeyInput);
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 2000);
    loadHealth();
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground mt-1">Infrastructure, gateway connection, and admin credentials.</p>
        </div>
        <button
          onClick={loadHealth}
          className="h-9 px-3 border rounded-lg text-xs font-medium inline-flex items-center gap-2 hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-6">
        {/* Admin Authentication Token */}
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Admin Dashboard Authorization
          </h2>
          <p className="text-sm text-muted-foreground">
            The secret key used by the dashboard to authenticate with the Gateway administrative endpoints.
          </p>
          <form onSubmit={handleSaveKey} className="flex gap-2">
            <input
              type="password"
              value={adminKeyInput}
              onChange={e => setAdminKeyInput(e.target.value)}
              className="flex-1 bg-background border px-3 py-2 rounded-lg font-mono text-xs"
              placeholder="dvai_admin_..."
              required
            />
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium inline-flex items-center gap-1.5 shadow hover:bg-primary/90"
            >
              {savedKey ? <Check className="h-3.5 w-3.5 text-green-300" /> : null}
              {savedKey ? 'Saved' : 'Save Key'}
            </button>
          </form>
        </div>

        {/* Gateway Endpoint */}
        <div className="border rounded-xl p-6 bg-card space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Gateway Configuration
          </h2>
          <div className="divide-y text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-muted-foreground">API Base URL</span>
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{API_URL}</span>
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
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${health.status === 'healthy' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${health.status === 'healthy' ? 'bg-green-500' : 'bg-amber-500'}`} />
                  {health.status}
                </span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-muted-foreground">Neon PostgreSQL</span>
                <span className="font-medium text-green-500">{health.database || 'Connected'}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-muted-foreground">Upstash Redis</span>
                <span className="font-medium text-green-500">{health.redis || 'Connected'}</span>
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