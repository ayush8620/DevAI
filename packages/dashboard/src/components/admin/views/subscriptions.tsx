"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { panelApi } from '@/lib/admin-api';
import { Badge, Card, Empty, ErrorBox, Loading, Notice, PageHeader, Pager, Stat, Table, field, fmt, statusTone } from '../ui';

const STATUSES = ['active', 'authenticated', 'pending', 'halted', 'cancelled', 'completed', 'expired'];
const PAGE = 50;

export function SubscriptionsView({ paymentsConfigured }: { paymentsConfigured: boolean }) {
  const [f, setF] = useState({ status: '', plan: '', source: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    panelApi.getSubscriptions({ ...f, page, limit: PAGE }).then(r => { setRes(r); setError(null); }).catch(e => setError(e.message));
  }, [f, page]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  const s = res?.summary;

  return (
    <>
      <PageHeader title="Subscriptions" description="Every billing record stored on users (Razorpay subscriptions, manual comps and old one-time orders)." />
      {error && <ErrorBox message={error} />}
      {!paymentsConfigured && <Notice>Razorpay keys are not set on the dashboard, so nobody can pay yet. Records here are comps (or test data).</Notice>}
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Paid now" value={fmt.n(s.active)} hint={`student ${s.byPlan.student} · pro ${s.byPlan.pro} · team ${s.byPlan.team}`} />
          <Stat label="Renewing" value={fmt.n(s.recurring)} hint="Razorpay, not cancelled" />
          <Stat label="Comp" value={fmt.n(s.bySource.comp)} hint="given manually" />
          <Stat label="MRR estimate" accent value={paymentsConfigured ? fmt.inr(s.mrrPaise) : '₹0'} hint={paymentsConfigured ? 'yearly ÷ 12' : 'payments not configured'} />
        </div>
      )}
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <select aria-label="Status" className={field} value={f.status} onChange={set('status')}><option value="">All statuses</option>{STATUSES.map(x => <option key={x}>{x}</option>)}</select>
          <select aria-label="Plan" className={field} value={f.plan} onChange={set('plan')}><option value="">All plans</option>{['student', 'pro', 'team'].map(x => <option key={x}>{x}</option>)}</select>
          <select aria-label="Source" className={field} value={f.source} onChange={set('source')}><option value="">All sources</option>{['razorpay', 'comp', 'legacy'].map(x => <option key={x}>{x}</option>)}</select>
        </div>
        {!res ? <Loading /> : (
          <>
            <Table head={['User', 'Plan', 'Status', 'Source', 'Renews / ends', 'Code', 'Updated']} empty={!res.data.length && <Empty>No subscriptions match.</Empty>}>
              {res.data.map((r: any) => (
                <tr key={r.userId}>
                  <td className="max-w-[240px] truncate"><Link className="font-medium hover:text-primary" href={`/admin/users/${encodeURIComponent(r.userId)}`}>{r.email || r.userId}</Link></td>
                  <td className="capitalize whitespace-nowrap">{r.plan} · {r.period}</td>
                  <td><Badge tone={statusTone(r.status)}>{r.status}</Badge>{r.cancelAtPeriodEnd && r.source === 'razorpay' && <span className="ml-1 text-xs text-muted-foreground">cancels</span>}</td>
                  <td className="capitalize">{r.source}</td>
                  <td className="whitespace-nowrap">{fmt.date(r.expiresAt)}{r.renews && <span className="ml-1 text-xs text-ok">↻</span>}</td>
                  <td className="font-mono text-xs">{r.coupon || '—'}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmt.ago(r.updatedAt)}</td>
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
