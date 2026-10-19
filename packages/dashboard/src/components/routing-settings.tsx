"use client";
import { useEffect, useMemo, useState } from 'react';
import { adminApi as api } from '@/lib/admin-api';
import { ArrowDown, ArrowUp, Route, Save, Check } from 'lucide-react';

type Mode = 'single' | 'fastest' | 'best';
type Spec = string | { provider: string; model?: string };

export interface RoutingConfig {
  mode?: Mode;
  providers?: Spec[];
  judge?: Spec;
  timeoutMs?: number;
}

interface Provider { id: string; name: string; type: string; status: string }
interface Row { providerId: string; name: string; type: string; model: string; enabled: boolean }

const MODES: { id: Mode; label: string; help: string }[] = [
  { id: 'single', label: 'Single + failover', help: 'One provider at a time, in priority order. If it errors, times out or is down, the next one answers automatically. Cheapest.' },
  { id: 'fastest', label: 'Parallel: fastest', help: 'Sends to all selected providers at once and returns the first valid answer; slower calls are cancelled.' },
  { id: 'best', label: 'Parallel: best', help: 'Sends to all selected providers, waits for their answers, and a judge model picks the best one. Uses the most tokens.' },
];

function parseSpec(s: Spec) {
  if (typeof s !== 'string') return s;
  const i = s.indexOf(':');
  return i === -1 ? { provider: s } : { provider: s.slice(0, i), model: s.slice(i + 1) };
}

export function RoutingSettings({ projectId, routing, onSaved }: { projectId: string; routing?: RoutingConfig; onSaved?: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [mode, setMode] = useState<Mode>(routing?.mode ?? 'single');
  const [rows, setRows] = useState<Row[]>([]);
  const [judge, setJudge] = useState<string>('');
  const [timeoutSec, setTimeoutSec] = useState<number>(Math.round((routing?.timeoutMs ?? 30000) / 1000));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProviders().then((list: Provider[]) => setProviders(list.filter(p => p.status === 'active'))).catch(() => setProviders([]));
  }, []);

  // Build the editable list: configured providers first (in saved order), then the rest unticked.
  useEffect(() => {
    setMode(routing?.mode ?? 'single');
    setTimeoutSec(Math.round((routing?.timeoutMs ?? 30000) / 1000));
    const specs = (routing?.providers ?? []).map(parseSpec);
    const configured: Row[] = [];
    for (const s of specs) {
      const p = providers.find(x => x.id === s.provider || x.name.toLowerCase() === s.provider.toLowerCase());
      if (p) configured.push({ providerId: p.id, name: p.name, type: p.type, model: s.model ?? '', enabled: true });
    }
    const rest = providers
      .filter(p => !configured.some(r => r.providerId === p.id))
      .map(p => ({ providerId: p.id, name: p.name, type: p.type, model: '', enabled: false }));
    setRows([...configured, ...rest]);
    const j = routing?.judge ? parseSpec(routing.judge) : null;
    const jp = j && providers.find(x => x.id === j.provider || x.name.toLowerCase() === j.provider.toLowerCase());
    setJudge(jp ? `${jp.id}:${j?.model ?? ''}` : '');
  }, [routing, providers]);

  const enabled = useMemo(() => rows.filter(r => r.enabled), [rows]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const routingBody: RoutingConfig = {
        mode,
        timeoutMs: Math.max(1, timeoutSec) * 1000,
        ...(enabled.length ? { providers: enabled.map(r => (r.model.trim() ? { provider: r.providerId, model: r.model.trim() } : { provider: r.providerId })) } : {}),
      };
      if (mode === 'best' && judge) {
        const [pid, model] = [judge.slice(0, judge.indexOf(':')), judge.slice(judge.indexOf(':') + 1)];
        routingBody.judge = model ? { provider: pid, model } : { provider: pid };
      }
      await api.updateProject(projectId, { routing: routingBody });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const parallel = mode !== 'single';

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><Route className="h-5 w-5 text-primary" /> Routing</h2>
        <p className="text-sm text-muted-foreground">Default for every request from this app. A request can override it with <code className="text-xs">devai.mode</code> or the <code className="text-xs">x-devai-mode</code> header.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Mode</label>
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`text-left p-4 border rounded-lg transition-all ${mode === m.id ? 'ring-2 ring-primary border-primary bg-primary/5' : 'hover:border-primary/50'}`}
            >
              <div className="font-semibold text-sm">{m.label}{m.id === 'single' && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}</div>
              <p className="text-xs text-muted-foreground mt-1">{m.help}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{parallel ? 'Providers that run in parallel' : 'Provider priority order (first is tried first)'}</label>
        <p className="text-xs text-muted-foreground">Tick the providers to use and order them. Leave all unticked to use every active provider automatically. Model is optional (defaults to the request&apos;s model or the provider default).</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No active providers yet. Add one on the Providers page.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {rows.map((r, i) => (
              <div key={r.providerId} className={`flex items-center gap-3 p-3 ${r.enabled ? '' : 'opacity-60'}`}>
                <input type="checkbox" checked={r.enabled} onChange={e => update(i, { enabled: e.target.checked })} aria-label={`Use ${r.name}`} />
                <span className="w-6 text-xs text-muted-foreground">{r.enabled ? enabled.indexOf(r) + 1 : ''}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.type}</div>
                </div>
                <input
                  value={r.model}
                  onChange={e => update(i, { model: e.target.value })}
                  placeholder="model (optional)"
                  className="w-56 bg-background border px-2 py-1.5 rounded-md text-xs font-mono"
                />
                <button type="button" onClick={() => move(i, -1)} className="p-1.5 border rounded-md hover:bg-muted" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1.5 border rounded-md hover:bg-muted" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mode === 'best' && (
          <div className="space-y-1">
            <label className="text-sm font-medium">Judge model</label>
            <select value={judge} onChange={e => setJudge(e.target.value)} className="w-full bg-background border px-3 py-2 rounded-lg text-sm">
              <option value="">First provider in the list (default)</option>
              {enabled.map(r => (
                <option key={r.providerId} value={`${r.providerId}:${r.model}`}>{r.name}{r.model ? ` / ${r.model}` : ''}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">A cheap, fast model works well. If the judge fails, the most complete answer is used.</p>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium">Timeout per provider (seconds)</label>
          <input type="number" min={1} max={120} value={timeoutSec} onChange={e => setTimeoutSec(Number(e.target.value))} className="w-full bg-background border px-3 py-2 rounded-lg text-sm" />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary-hover h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? 'Saved' : saving ? 'Saving…' : 'Save routing'}
        </button>
      </div>
    </div>
  );
}
