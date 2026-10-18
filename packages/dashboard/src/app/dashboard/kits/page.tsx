"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Plus, Copy, Check, Link2, Ban, AlertTriangle, Users, Clock } from 'lucide-react';
import { userApi } from '@/lib/api';
import { clerkEnabled } from '@/lib/clerk';
import { KitMeter, kitStatusBadge, timeLeft } from '@/components/kits/kit-meter';

function defaultExpiry() {
  const d = new Date(Date.now() + 48 * 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted" aria-label={label}>
      {done ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}{done ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function KitsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', expiresAt: defaultExpiry(), requestCap: '1000', tokenCap: '', maxTeamSize: '4', keyCount: '4', allowedModels: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const load = () => userApi.getKits().then(d => { setData(d); setError(null); }).catch(e => setError(e.message));
  useEffect(() => { if (clerkEnabled) load(); }, []);

  if (!clerkEnabled) {
    return <div className="p-5 sm:p-8 max-w-3xl"><h1>Hackathon kits</h1><p className="mt-4 rounded-xl border bg-card p-5 text-sm text-muted-foreground">Kits belong to a signed-in account. Clerk sign-in is not configured on this deployment.</p></div>;
  }

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setFormError(null);
    try {
      const kit = await userApi.createKit({
        name: form.name,
        expiresAt: new Date(form.expiresAt).toISOString(),
        requestCap: num(form.requestCap), tokenCap: num(form.tokenCap),
        maxTeamSize: num(form.maxTeamSize), keyCount: num(form.keyCount) ?? 1,
        allowedModels: form.allowedModels.split(',').map(s => s.trim()).filter(Boolean),
      });
      setCreated(kit);
      setForm(f => ({ ...f, name: '' }));
      await load();
    } catch (err: any) { setFormError(err.message); } finally { setBusy(false); }
  };

  const canCreate = data?.canCreate;
  const input = 'mt-1 w-full bg-background border px-3 py-2 rounded-lg text-sm text-foreground';

  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-7xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Team plan</p>
        <h1 className="mt-2">Hackathon kits</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">Hand a team temporary API keys with a hard request or token cap, an end date and an allowed-model list. Traffic runs on your key pool, and the gateway cuts it off at the cap or the deadline.</p>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400"><AlertTriangle className="h-4 w-4 mt-0.5" />{error}</div>}

      {data && !canCreate && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Hackathon kits are included in the <strong>Team</strong> plan. You are on <span className="capitalize">{data.plan}</span>.</p>
          <Link href="/dashboard/billing" className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90">Upgrade to Team</Link>
        </div>
      )}

      {created && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">“{created.name}” is live: save these keys now</h2>
            <button onClick={() => setCreated(null)} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
          </div>
          <p className="text-xs text-amber-500">Each key is shown only once. Give one to each team member.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {created.keys.map((k: any) => (
              <li key={k.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">{k.name}</span>
                <code className="flex-1 min-w-0 truncate font-mono text-[11px]">{k.key}</code>
                <CopyButton text={k.key} label={`Copy ${k.name} key`} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Share page:</span>
            <code className="font-mono">{origin}/kit/{created.shareToken}</code>
            <CopyButton text={`${origin}/kit/${created.shareToken}`} label="Copy share link" />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="rounded-xl border bg-card p-5 shadow-sm space-y-3 self-start">
          <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> New kit</h2>
          <label className="block text-xs font-medium text-muted-foreground">Kit name
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} placeholder="e.g. HackIndia 2026 – Team 7" />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">Ends at (your local time)
            <input type="datetime-local" required value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-muted-foreground">Request cap
              <input type="number" min={1} value={form.requestCap} onChange={e => setForm({ ...form, requestCap: e.target.value })} className={input} placeholder="none" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Token cap
              <input type="number" min={1} value={form.tokenCap} onChange={e => setForm({ ...form, tokenCap: e.target.value })} className={input} placeholder="none" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Max team size
              <input type="number" min={1} max={50} value={form.maxTeamSize} onChange={e => setForm({ ...form, maxTeamSize: e.target.value })} className={input} placeholder="any" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Keys to issue
              <input type="number" min={1} max={50} required value={form.keyCount} onChange={e => setForm({ ...form, keyCount: e.target.value })} className={input} />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">Allowed models (comma-separated, empty = any)
            <input value={form.allowedModels} onChange={e => setForm({ ...form, allowedModels: e.target.value })} className={`${input} font-mono text-xs`} placeholder="gemini-2.5-flash, llama-3.1-8b-instant" />
          </label>
          {formError && <p role="alert" className="text-xs text-red-400">{formError}</p>}
          <button type="submit" disabled={busy || !canCreate} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50">
            {!canCreate ? 'Team plan required' : busy ? 'Creating…' : 'Create kit'}
          </button>
          <p className="text-[11px] text-muted-foreground">Requests use the keys in your <Link href="/dashboard/pool" className="text-primary hover:underline">key pool</Link>. A kit can last up to 30 days.</p>
        </form>

        <div className="space-y-4">
          {!data ? <div className="h-40 rounded-xl bg-muted animate-pulse" />
            : data.kits.length === 0 ? (
              <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                <Trophy className="mx-auto mb-3 h-10 w-10 opacity-30" />No kits yet.
              </div>
            ) : data.kits.map((k: any) => (
              <div key={k.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2"><h3 className="font-semibold">{k.name}</h3>{kitStatusBadge(k.status)}</div>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(k.expiresAt).toLocaleString()} · {k.status === 'active' ? timeLeft(k.expiresAt) : k.status === 'revoked' ? 'revoked' : 'ended'}</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{k.keyCount} keys{k.maxTeamSize ? ` · team of ${k.maxTeamSize}` : ''}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/kit/${k.shareToken}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"><Link2 className="h-3.5 w-3.5" />Share page</Link>
                    <CopyButton text={`${origin}/kit/${k.shareToken}`} label={`Copy share link for ${k.name}`} />
                    {k.status === 'active' && (
                      <button onClick={async () => { if (confirm(`Revoke "${k.name}"? Its keys stop working immediately.`)) { await userApi.revokeKit(k.id).catch(e => setError(e.message)); load(); } }} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                        <Ban className="h-3.5 w-3.5" />Revoke
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <KitMeter label="Requests" used={k.usage.requests} cap={k.requestCap} />
                  <KitMeter label="Tokens" used={k.usage.tokens} cap={k.tokenCap} />
                </div>
                <p className="text-xs text-muted-foreground">Models: {k.allowedModels.length ? <span className="font-mono">{k.allowedModels.join(', ')}</span> : 'any model in your pool'}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
