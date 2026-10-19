"use client";
import { useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { panelApi } from '@/lib/admin-api';
import { API_URL, getAdminKey, setAdminKey } from '@/lib/api';
import { Badge, Card, ErrorBox, Loading, PageHeader, Table, btn, btnPrimary, field, fmt, statusTone } from '../ui';

export interface DashboardBuild { commit: string | null; branch: string | null; env: string | null; clerk: boolean; payments: boolean }

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : 'unknown');
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>
);

export function SystemView({ dashboard, keyMode }: { dashboard: DashboardBuild; keyMode: boolean }) {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  const load = () => {
    setLoading(true);
    panelApi.getSystem().then(x => { setD(x); setError(null); })
      .catch(async e => {
        setError(e.message);
        // Still show the public health when the admin call fails (e.g. no admin key yet)
        const h = await panelApi.getHealth();
        setD((cur: any) => cur ?? { health: h, build: null, config: null, migrations: [] });
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); setKey(getAdminKey()); }, []);

  const h = d?.health;
  return (
    <>
      <PageHeader title="System" description="Gateway health (/v1/health), versions and configuration."
        actions={<button className={btn} onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>} />
      {error && <ErrorBox message={error} />}
      {!d ? <Loading /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Health" actions={h?.status && <Badge tone={statusTone(h.status)}>{h.status}</Badge>}>
            <div className="divide-y">
              <Row k="Gateway" v={<Badge tone={statusTone(h?.gateway ?? (h?.status === 'unreachable' ? 'unhealthy' : 'healthy'))}>{h?.gateway ?? h?.status ?? 'unknown'}</Badge>} />
              <Row k="Database (Postgres)" v={<Badge tone={statusTone(h?.database)}>{h?.database ?? 'unknown'}</Badge>} />
              <Row k="Redis" v={<Badge tone={statusTone(h?.redis)}>{h?.redis ?? 'unknown'}</Badge>} />
              <Row k="Uptime" v={h?.uptime != null ? `${Math.floor(h.uptime / 3600)}h ${Math.floor((h.uptime % 3600) / 60)}m` : '—'} />
              <Row k="Gateway URL" v={<span className="font-mono text-xs break-all">{API_URL}</span>} />
              <Row k="Shared providers checked" v={fmt.dateTime(h?.providers_checked_at)} />
            </div>
            {h?.providers?.length > 0 && (
              <div className="mt-4">
                <Table head={['Provider', 'Status', 'Latency', 'Keys']}>
                  {h.providers.map((p: any) => (
                    <tr key={p.id}><td>{p.name}</td><td><Badge tone={statusTone(p.status)}>{p.status}</Badge></td><td>{p.latencyMs} ms</td><td>{p.keys ? `${p.keys.healthy}/${p.keys.total}` : '—'}</td></tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>

          <Card title="Versions">
            <div className="divide-y">
              <Row k="Gateway commit" v={<span className="font-mono text-xs">{short(d.build?.commit)}{d.build?.branch ? ` (${d.build.branch})` : ''}</span>} />
              <Row k="Gateway version" v={d.build?.version ?? '—'} />
              <Row k="Gateway runtime" v={d.build ? `${d.build.node} · ${d.build.env}` : '—'} />
              <Row k="Gateway started" v={fmt.dateTime(d.build?.startedAt)} />
              <Row k="Dashboard commit" v={<span className="font-mono text-xs">{short(dashboard.commit)}{dashboard.branch ? ` (${dashboard.branch})` : ''}</span>} />
              <Row k="Dashboard environment" v={dashboard.env ?? '—'} />
            </div>
          </Card>

          <Card title="Configuration">
            <div className="divide-y">
              <Row k="Clerk on the dashboard" v={<Badge tone={dashboard.clerk ? 'ok' : 'warn'}>{dashboard.clerk ? 'configured' : 'not set'}</Badge>} />
              <Row k="Razorpay payments" v={<Badge tone={dashboard.payments ? 'ok' : 'warn'}>{dashboard.payments ? 'configured' : 'not configured'}</Badge>} />
              {d.config && <>
                <Row k="Clerk on the gateway" v={<Badge tone={d.config.clerkSecretKey ? 'ok' : 'warn'}>{d.config.clerkSecretKey ? 'secret key set' : d.config.clerk ? 'JWT key only' : 'not set'}</Badge>} />
                <Row k="Admin allowlist" v={`${d.config.adminEmails} email${d.config.adminEmails === 1 ? '' : 's'} · ${d.config.adminUserIds} user id${d.config.adminUserIds === 1 ? '' : 's'}`} />
                <Row k="Allowed origins" v={d.config.allowedOrigins} />
                <Row k="User directory" v={d.config.userDirectory} />
              </>}
            </div>
          </Card>

          <Card title="Database migrations">
            <div className="divide-y">
              {d.migrations.map((m: any) => (
                <Row key={m.name} k={m.name} v={<Badge tone={m.applied ? 'ok' : m.applied === false ? 'bad' : 'muted'}>{m.applied ? 'applied' : m.applied === false ? 'not run' : 'unknown'}</Badge>} />
              ))}
            </div>
            {d.migrations.some((m: any) => m.applied === false) && <p className="mt-3 text-xs text-muted-foreground">Run the missing file with <code className="font-mono">psql &quot;$DATABASE_URL&quot; -f packages/gateway/drizzle/&lt;name&gt;.sql</code>. Each file is safe to run twice.</p>}
          </Card>

          <Card title="Admin key fallback" className="lg:col-span-2">
            <p className="mb-3 text-sm text-muted-foreground">
              {keyMode
                ? 'Clerk is not configured for this dashboard, so the admin panel calls the gateway with its ADMIN_API_KEY. It is stored in this browser only.'
                : 'Optional: the gateway ADMIN_API_KEY, used only if your Clerk session is refused. Stored in this browser only; leave empty and save to remove it.'}
            </p>
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setAdminKey(key); setSaved(true); setTimeout(() => setSaved(false), 2000); load(); }}>
              <input type="password" aria-label="Admin API key" className={`${field} flex-1 font-mono text-xs`} placeholder="dvai_admin_..." value={key} onChange={e => setKey(e.target.value)} />
              <button className={btnPrimary + ' h-9'}>{saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save key'}</button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
