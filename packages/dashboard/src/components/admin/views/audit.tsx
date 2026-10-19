"use client";
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Table, btn, field, fmt } from '../ui';

const PAGE = 50;

export function AuditView() {
  const params = useSearchParams();
  const initial = { q: '', actor: '', action: '', resourceType: '', resourceId: params.get('resourceId') || '', from: '', to: '' };
  const [form, setForm] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [offset, setOffset] = useState(0);
  const [res, setRes] = useState<any>(null);
  const [facets, setFacets] = useState<{ actions: string[]; resourceTypes: string[] }>({ actions: [], resourceTypes: [] });
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { panelApi.getAuditFacets().then(setFacets).catch(() => {}); }, []);
  useEffect(() => {
    setRes(null);
    panelApi.getAudit({
      ...filters,
      from: filters.from ? new Date(filters.from).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
      limit: PAGE, offset,
    }).then(r => { setRes(r); setError(null); }).catch(e => setError(e.message));
  }, [filters, offset]);

  const groups = Array.from(new Set(facets.actions.map(a => a.split('.')[0])));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Audit log" description="Every admin action (plan changes, suspensions, revokes, providers, codes) and key user actions, newest first." />
      {error && <ErrorBox message={error} />}
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e => { e.preventDefault(); setOffset(0); setFilters(form); }}>
          <input aria-label="Search" className={field} placeholder="Search actor, action or id" value={form.q} onChange={set('q')} />
          <input aria-label="Actor" className={field} placeholder="Actor (email or clerk:id)" value={form.actor} onChange={set('actor')} />
          <select aria-label="Action" className={field} value={form.action} onChange={set('action')}>
            <option value="">All actions</option>
            {groups.map(g => <option key={g} value={`${g}.`}>{g}.*</option>)}
            {facets.actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Resource type" className={field} value={form.resourceType} onChange={set('resourceType')}>
            <option value="">All resources</option>
            {facets.resourceTypes.map(t => <option key={t}>{t}</option>)}
          </select>
          <input aria-label="Resource id" className={field} placeholder="Resource id" value={form.resourceId} onChange={set('resourceId')} />
          <input aria-label="From" type="date" className={field} value={form.from} onChange={set('from')} />
          <input aria-label="To" type="date" className={field} value={form.to} onChange={set('to')} />
          <div className="flex gap-2">
            <button className="h-9 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">Filter</button>
            <button type="button" className="h-9 rounded-md border px-3 text-sm hover:bg-muted" onClick={() => { const e = { ...initial, resourceId: '' }; setForm(e); setFilters(e); setOffset(0); }}>Clear</button>
          </div>
        </form>
        {!res ? <Loading /> : (
          <>
            <Table head={['When', 'Actor', 'Action', 'Resource', 'Details']} empty={!res.data.length && <Empty>No entries match.</Empty>}>
              {res.data.map((l: any) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-muted-foreground" title={l.createdAt}>{fmt.dateTime(l.createdAt)}</td>
                  <td className="max-w-[200px] truncate">{l.actor}</td>
                  <td><Badge tone={/revoked|suspended|deleted/.test(l.action) ? 'bad' : /created|unsuspended/.test(l.action) ? 'ok' : 'muted'}>{l.action}</Badge></td>
                  <td className="max-w-[220px] truncate text-xs"><span className="text-muted-foreground">{l.resourceType}</span> <span className="font-mono">{l.resourceId}</span></td>
                  <td className="max-w-[320px] text-xs">
                    {l.details && Object.keys(l.details).length ? (
                      open === l.id
                        ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]" onClick={() => setOpen(null)}>{JSON.stringify(l.details, null, 2)}</pre>
                        : <button className="truncate text-left text-muted-foreground hover:text-foreground max-w-full" onClick={() => setOpen(l.id)}>{JSON.stringify(l.details)}</button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </Table>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btn} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</button>
              <button className={btn} disabled={!res.hasMore} onClick={() => setOffset(offset + PAGE)}>Older</button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
