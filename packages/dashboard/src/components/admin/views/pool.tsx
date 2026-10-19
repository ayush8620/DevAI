"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban } from 'lucide-react';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat, Table, btnDanger, fmt, statusTone } from '../ui';

const owner = (id: string | null, email: string | null) =>
  id ? <Link href={`/admin/users/${encodeURIComponent(id)}`} className="hover:text-primary">{email || id}</Link> : '—';

export function PoolView() {
  const [d, setD] = useState<any>(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => panelApi.getPool(days).then(x => { setD(x); setError(null); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, [days]);

  const revoke = async (id: string, what: string, fn: (id: string, reason?: string) => Promise<unknown>) => {
    const reason = prompt(`Revoke ${what}? It stops working immediately and the owner cannot turn it back on.\n\nReason (for the audit log):`);
    if (reason === null) return;
    setBusy(id);
    try { await fn(id, reason || undefined); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };

  const c = d?.counts;
  return (
    <>
      <PageHeader title="Key pool & kits" description="Users' own provider keys (BYOK), their pool API keys and hackathon kits. Revoke anything abusive here; every revoke is audited." />
      {error && <ErrorBox message={error} />}
      {!d ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Provider keys" value={fmt.n(c.providerKeys.total)} hint={`${c.providerKeys.active} active · ${c.providerKeys.disabled} off · ${c.providerKeys.revoked} revoked`} />
            <Stat label="Users with keys" value={fmt.n(c.providerKeys.owners)} />
            <Stat label="Pool API keys" value={fmt.n(c.poolApiKeys.total)} hint={`${c.poolApiKeys.active} active`} />
            <Stat label="Hackathon kits" value={fmt.n(c.kits.total)} hint={`${c.kits.active} active · ${c.kits.expired} expired · ${c.kits.revoked} revoked · ${c.kits.keys} keys`} />
          </div>

          <Card title={`Busiest provider keys (last ${days} days)`} actions={
            <select aria-label="Window" className="h-8 rounded-md border bg-background px-2 text-xs" value={days} onChange={e => setDays(Number(e.target.value))}>
              {[1, 7, 30].map(n => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}
            </select>
          }>
            <Table head={['Key', 'Owner', 'Requests', 'Errors', 'Status', '']} empty={!d.providerKeys.length && <Empty>No user keys yet.</Empty>}>
              {d.providerKeys.map((k: any) => {
                const st = k.status === 'active' && !k.enabled ? 'disabled' : k.status;
                return (
                  <tr key={k.id}>
                    <td><span className="font-medium">{k.provider}</span> <span className="text-muted-foreground">{k.name}</span> <span className="font-mono text-xs text-muted-foreground">{k.key}</span></td>
                    <td className="max-w-[220px] truncate">{owner(k.ownerUserId, k.ownerEmail)}</td>
                    <td className="tabular-nums">{fmt.n(k.requests)}</td>
                    <td className="tabular-nums">{fmt.n(k.errors)}</td>
                    <td><Badge tone={statusTone(st)}>{st}</Badge></td>
                    <td className="text-right">{st !== 'revoked' && <button className={btnDanger} disabled={busy === k.id} onClick={() => revoke(k.id, `${k.provider} key "${k.name}"`, panelApi.revokePoolKey)}><Ban className="h-3 w-3" /> Revoke</button>}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card title="Pool API keys (recently used)">
            <Table head={['Key', 'Owner', 'Last used', 'Status', '']} empty={!d.poolApiKeys.length && <Empty>No pool API keys yet.</Empty>}>
              {d.poolApiKeys.map((k: any) => (
                <tr key={k.id}>
                  <td><span className="font-mono text-xs">{k.key}</span> <span className="text-muted-foreground">{k.name}</span></td>
                  <td className="max-w-[220px] truncate">{owner(k.ownerUserId, k.ownerEmail)}</td>
                  <td className="text-muted-foreground">{fmt.ago(k.lastUsedAt)}</td>
                  <td><Badge tone={statusTone(k.status)}>{k.status}</Badge></td>
                  <td className="text-right">{k.status === 'active' && <button className={btnDanger} disabled={busy === k.id} onClick={() => revoke(k.id, `API key ${k.key}`, panelApi.revokePoolApiKey)}><Ban className="h-3 w-3" /> Revoke</button>}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Hackathon kits (latest 50)">
            <Table head={['Kit', 'Owner', 'Usage', 'Expires', 'Status', '']} empty={!d.kits.length && <Empty>No kits yet.</Empty>}>
              {d.kits.map((k: any) => (
                <tr key={k.id}>
                  <td className="font-medium">{k.name} <span className="text-xs text-muted-foreground">{k.keyCount} keys</span></td>
                  <td className="max-w-[220px] truncate">{owner(k.ownerUserId, k.ownerEmail)}</td>
                  <td className="text-xs tabular-nums">{k.usage ? <>{fmt.n(k.usage.requests)}{k.requestCap ? ` / ${fmt.n(k.requestCap)}` : ''} req · {fmt.n(k.usage.tokens)}{k.tokenCap ? ` / ${fmt.n(k.tokenCap)}` : ''} tok</> : '—'}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmt.dateTime(k.expiresAt)}</td>
                  <td><Badge tone={statusTone(k.status)}>{k.status}</Badge></td>
                  <td className="text-right">{k.status === 'active' && <button className={btnDanger} disabled={busy === k.id} onClick={() => revoke(k.id, `kit "${k.name}"`, panelApi.revokeKit)}><Ban className="h-3 w-3" /> Revoke</button>}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
