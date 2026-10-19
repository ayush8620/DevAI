"use client";
import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, Table, fmt, statusTone } from './ui';

/** Health of the shared providers: last background check per provider and key, 24 h uptime. */
export function ProviderHealthPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { panelApi.getProviderHealth().then(setRows).catch(e => setError(e.message)); }, [refreshKey]);
  return (
    <Card title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Health (last 24 hours)</span>}>
      {error ? <p className="text-sm text-bad">{error}</p> : !rows ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Table head={['Provider', 'Last check', 'Latency', 'Uptime 24h', 'Keys']} empty={!rows.length && <Empty>No shared providers. Users bring their own keys, so this is normal.</Empty>}>
          {rows.map(p => (
            <tr key={p.providerId}>
              <td><span className="font-medium">{p.name}</span> <span className="text-xs text-muted-foreground">{p.type}</span>{p.status !== 'active' && <> <Badge tone="warn">{p.status}</Badge></>}</td>
              <td>{p.lastCheck ? <><Badge tone={statusTone(p.lastCheck.status)}>{p.lastCheck.status}</Badge> <span className="text-xs text-muted-foreground">{fmt.ago(p.lastCheck.checkedAt)}</span></> : <span className="text-xs text-muted-foreground">never</span>}</td>
              <td className="tabular-nums">{p.lastCheck?.latencyMs != null ? `${p.lastCheck.latencyMs} ms` : '—'}</td>
              <td className="tabular-nums">{p.uptime24h == null ? '—' : `${p.uptime24h}% (${p.checks24h})`}</td>
              <td className="text-xs">
                {p.keys.length ? p.keys.map((k: any) => (
                  <span key={k.credentialId} className="mr-2 inline-flex items-center gap-1" title={k.lastCheck?.error || undefined}>
                    {k.name} <Badge tone={statusTone(!k.enabled ? 'disabled' : k.lastCheck?.status ?? 'muted')}>{!k.enabled ? 'off' : k.lastCheck?.status ?? 'unchecked'}</Badge>
                  </span>
                )) : '—'}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
