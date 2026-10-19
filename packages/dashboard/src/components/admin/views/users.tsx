"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, ErrorBox, Loading, Notice, PageHeader, Pager, Table, field, fmt, statusTone } from '../ui';

const PAGE = 25;

export function UsersView() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    panelApi.getUsers({ q: query, page, limit: PAGE }).then(r => { setRes(r); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [query, page]);

  return (
    <>
      <PageHeader title="Users" description="Everyone who signed up (from Clerk), with their plan, status and gateway activity. Open a user to change their plan or suspend them." />
      {error && <ErrorBox message={error} />}
      {res?.source === 'database' && <Notice>CLERK_SECRET_KEY is not set on the gateway, so this list only shows user ids found in the database.</Notice>}
      <Card>
        <form className="mb-4 flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email, name or user id" aria-label="Search users" className={`${field} w-full pl-9`} />
          </div>
          <button className="h-9 rounded-md border bg-card px-3 text-sm hover:bg-muted">Search</button>
        </form>
        {loading && !res ? <Loading /> : res && (
          <>
            <Table head={['User', 'Plan', 'Status', 'Created', 'Last active', 'Requests (30d)', 'BYOK keys']} empty={!res.data.length && <Empty>No users match.</Empty>}>
              {res.data.map((u: any) => (
                <tr key={u.id}>
                  <td className="max-w-[260px]">
                    <Link href={`/admin/users/${encodeURIComponent(u.id)}`} className="block truncate font-medium hover:text-primary">{u.email || u.id}</Link>
                    <span className="block truncate text-xs text-muted-foreground">{u.name || u.id}{u.isAdmin && ' · admin'}</span>
                  </td>
                  <td><Badge tone={u.plan === 'free' ? 'muted' : 'accent'}>{u.plan}</Badge></td>
                  <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmt.date(u.createdAt)}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmt.ago(u.lastActiveAt)}</td>
                  <td className="text-right tabular-nums">{fmt.n(u.requests30d)}</td>
                  <td className="text-right tabular-nums">{fmt.n(u.byokKeys)}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} pageSize={PAGE} total={res.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
