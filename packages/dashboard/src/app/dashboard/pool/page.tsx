"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus, Trash2, Copy, Check, KeyRound, Zap, ShieldCheck, Activity, Power, AlertTriangle } from 'lucide-react';
import { userApi, API_URL } from '@/lib/api';
import { clerkEnabled } from '@/lib/clerk';

type Health = 'healthy' | 'cooling_down' | 'error' | 'disabled' | 'quota_exhausted' | 'unused';
const HEALTH: Record<Health, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'bg-green-500/10 text-green-500 border-green-500/30' },
  unused: { label: 'Not used yet', cls: 'bg-muted text-muted-foreground' },
  cooling_down: { label: 'Cooling down', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  quota_exhausted: { label: 'Quota used', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  error: { label: 'Error', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  disabled: { label: 'Disabled', cls: 'bg-muted text-muted-foreground' },
};
const STRATEGIES = [
  { id: 'round_robin', label: 'Round robin', hint: 'Spread requests evenly so every free quota lasts' },
  { id: 'least_used', label: 'Least used', hint: 'Key with the fewest recent requests first' },
  { id: 'failover', label: 'Failover', hint: 'Use keys in order; next one only on failure' },
  { id: 'random', label: 'Random', hint: 'Shuffle keys per request' },
];

export default function PoolPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ provider: 'gemini', name: '', apiKey: '', defaultModel: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => userApi.getPool().then(d => { setData(d); setError(null); }).catch(e => setError(e.message));
  useEffect(() => { if (clerkEnabled) load(); }, []);

  if (!clerkEnabled) {
    return (
      <div className="p-5 sm:p-8 max-w-3xl">
        <h1>Key pool</h1>
        <p className="mt-4 rounded-xl border bg-card p-5 text-sm text-muted-foreground">The personal key pool belongs to a signed-in account. Clerk sign-in is not configured on this deployment.</p>
      </div>
    );
  }

  const limit: number | null = data?.limit ?? null;
  const count = data?.keys?.length ?? 0;
  const atLimit = limit !== null && count >= limit;

  const addKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setFormError(null);
    try {
      await userApi.addPoolKey({ provider: form.provider, name: form.name || undefined, apiKey: form.apiKey, defaultModel: form.defaultModel || undefined });
      setForm(f => ({ ...f, name: '', apiKey: '', defaultModel: '' }));
      await load();
    } catch (err: any) { setFormError(err.message); } finally { setBusy(false); }
  };

  const createApiKey = async () => {
    try { const r = await userApi.createPoolApiKey('Pool key'); setNewKey(r.key); await load(); } catch (e: any) { setError(e.message); }
  };

  const provider = data?.providers?.find((p: any) => p.id === form.provider);

  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Free-key pooling</p>
          <h1 className="mt-2">Key pool</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">Add your own free provider keys. DevAI rotates requests across them, cools down a key the moment it hits a rate limit and moves on, so your free quotas stretch further.</p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" />
          {count} / {limit === null ? 'unlimited' : limit} keys · <span className="capitalize">{data?.plan ?? '…'}</span> plan{data?.isAdmin && ' · admin (Team limits)'}
          {atLimit && <Link href="/pricing" className="font-medium text-primary hover:underline">Upgrade</Link>}
        </span>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400"><AlertTriangle className="h-4 w-4 mt-0.5" />{error}</div>}

      {/* Stretch stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Quota stretched', value: data ? `${data.stats.stretchFactor}×` : '—', hint: 'Answers served vs. the busiest single key', icon: Zap },
          { label: 'Requests served', value: data ? data.stats.served.toLocaleString('en-IN') : '—', hint: `Last ${data?.stats.windowDays ?? 30} days`, icon: Activity },
          { label: 'Rate limits absorbed', value: data ? data.stats.rateLimitsAbsorbed.toLocaleString('en-IN') : '—', hint: '429s rerouted to another key', icon: ShieldCheck },
          { label: 'Tokens', value: data ? data.stats.tokens.toLocaleString('en-IN') : '—', hint: `${data?.stats.activeKeys ?? 0} keys answered`, icon: KeyRound },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4 sm:p-6 shadow-sm transition-colors hover:border-primary/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><s.icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Keys */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold">Pooled keys</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Rotation</span>
              <select
                value={data?.keyStrategy ?? 'round_robin'}
                onChange={async e => { await userApi.setPoolStrategy(e.target.value).catch(err => setError(err.message)); load(); }}
                className="bg-background border px-2.5 py-1.5 rounded-lg text-xs"
                aria-label="Key rotation strategy"
              >
                {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {!data ? (
            <div className="p-5 space-y-3">{[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : data.keys.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Layers className="mx-auto mb-3 h-10 w-10 opacity-30" />
              No keys yet. Add a free Gemini or Groq key to start your pool.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b text-left"><th className="py-2.5">Key</th><th className="py-2.5">Health</th><th className="py-2.5">Served</th><th className="py-2.5">429s</th><th className="py-2.5">Tokens</th><th className="py-2.5 text-right">Actions</th></tr></thead>
                <tbody>
                  {data.keys.map((k: any) => (
                    <tr key={k.id} className="border-b last:border-0">
                      <td className="py-3 pl-4 pr-3">
                        <div className="font-medium">{k.name}</div>
                        <div className="text-xs text-muted-foreground"><span className="font-mono">{k.key}</span> · {k.providerName}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${HEALTH[k.health as Health]?.cls}`}>{HEALTH[k.health as Health]?.label ?? k.health}</span>
                        {k.cooldownUntil && <div className="mt-1 text-[11px] text-muted-foreground">until {new Date(k.cooldownUntil).toLocaleTimeString()}</div>}
                        {k.lastError && k.health !== 'healthy' && <div className="mt-1 max-w-[220px] truncate text-[11px] text-muted-foreground" title={k.lastError}>{k.lastError}</div>}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{k.stats.successes}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{k.stats.rateLimited}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{k.stats.tokens.toLocaleString('en-IN')}</td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <button onClick={async () => { await userApi.updatePoolKey(k.id, { enabled: !k.enabled }).catch(e => setError(e.message)); load(); }} className="p-1.5 rounded-lg hover:bg-muted" title={k.enabled ? 'Disable' : 'Enable'} aria-label={k.enabled ? 'Disable key' : 'Enable key'}>
                          <Power className={`h-4 w-4 ${k.enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                        </button>
                        <button onClick={async () => { if (confirm(`Remove ${k.name} from your pool?`)) { await userApi.deletePoolKey(k.id).catch(e => setError(e.message)); load(); } }} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Remove key">
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Add key */}
          <form onSubmit={addKey} className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Add a key</h2>
            <label className="block text-xs font-medium text-muted-foreground">Provider
              <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} className="mt-1 w-full bg-background border px-3 py-2 rounded-lg text-sm text-foreground">
                {(data?.providers ?? [{ id: 'gemini', name: 'Gemini' }]).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {provider?.hint && <p className="text-[11px] text-muted-foreground">{provider.hint}</p>}
            <label className="block text-xs font-medium text-muted-foreground">API key
              <input type="password" required value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} className="mt-1 w-full bg-background border px-3 py-2 rounded-lg font-mono text-xs text-foreground" placeholder="Paste your provider key" autoComplete="off" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Name (optional)
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-background border px-3 py-2 rounded-lg text-sm text-foreground" placeholder="e.g. College account" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Default model for &quot;auto&quot; (optional)
              <input value={form.defaultModel} onChange={e => setForm({ ...form, defaultModel: e.target.value })} className="mt-1 w-full bg-background border px-3 py-2 rounded-lg font-mono text-xs text-foreground" placeholder={provider?.defaultModel ?? ''} />
            </label>
            {formError && <p role="alert" className="text-xs text-red-400">{formError}{atLimit && <> <Link href="/pricing" className="text-primary hover:underline">See plans</Link></>}</p>}
            <button type="submit" disabled={busy || atLimit} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50">
              {atLimit ? `Plan limit reached (${limit})` : busy ? 'Adding…' : 'Add to pool'}
            </button>
            <p className="text-[11px] text-muted-foreground">Keys are encrypted (AES-256-GCM) and only shown as prefix + last 4. They are used only for your own requests.</p>
          </form>

          {/* Pool API keys */}
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Your pool API key</h2>
              <button onClick={createApiKey} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">New key</button>
            </div>
            {newKey && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-[11px] text-amber-500">Copy it now. It will not be shown again.</p>
                <div className="flex gap-2">
                  <input readOnly value={newKey} className="flex-1 min-w-0 bg-background border px-2 py-1.5 rounded font-mono text-[11px]" />
                  <button onClick={() => { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="rounded bg-primary px-2 text-primary-foreground" aria-label="Copy key">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
            <ul className="space-y-1.5 text-xs">
              {(data?.apiKeys ?? []).filter((k: any) => k.status === 'active').map((k: any) => (
                <li key={k.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span><span className="font-mono">{k.keyPrefix}…</span> <span className="text-muted-foreground">{k.name}</span></span>
                  <button onClick={async () => { await userApi.revokePoolApiKey(k.id); load(); }} className="text-red-400 hover:underline">Revoke</button>
                </li>
              ))}
            </ul>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 text-[11px] text-zinc-100 font-mono">{`curl ${API_URL}/v1/chat/completions \\
  -H "Authorization: Bearer dvai_..." \\
  -d '{"model":"auto","messages":[{"role":"user","content":"hi"}]}'`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
