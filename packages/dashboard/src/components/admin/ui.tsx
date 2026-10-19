"use client";
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small building blocks shared by the admin pages (same tokens as the dashboard). */

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', accent && 'border-primary/40')}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tracking-tight', accent && 'text-primary')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  ok: 'border-green-600/30 bg-green-500/10 text-ok',
  warn: 'border-amber-600/30 bg-amber-500/10 text-warn',
  bad: 'border-red-600/30 bg-red-500/10 text-bad',
  accent: 'border-primary/40 bg-primary/10 text-foreground',
  muted: 'border-border bg-muted/60 text-muted-foreground',
};
export function Badge({ tone = 'muted', children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize whitespace-nowrap', TONES[tone] ?? TONES.muted)}>{children}</span>;
}

export function statusTone(s: string | null | undefined): string {
  switch (s) {
    case 'active': case 'healthy': case 'authenticated': return 'ok';
    case 'pending': case 'halted': case 'degraded': case 'cancelled': case 'expired': case 'disabled': case 'rate_limited': return 'warn';
    case 'suspended': case 'revoked': case 'unhealthy': case 'error': return 'bad';
    default: return 'muted';
  }
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-bad">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> <div>{children}</div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {label}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b">{head.map((h, i) => <th key={i} className="h-9 px-3 text-left align-middle font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      <span>{total.toLocaleString('en-IN')} total · page {page} of {pages}</span>
      <div className="flex gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export const btn = 'inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:pointer-events-none';
export const btnPrimary = 'inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary-hover disabled:opacity-50';
export const btnDanger = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-red-500/40 px-3 text-xs font-medium text-bad hover:bg-red-500/10 disabled:opacity-50';
export const field = 'h-9 rounded-md border bg-background px-3 text-sm';

export const fmt = {
  n: (v: unknown) => (Number(v) || 0).toLocaleString('en-IN'),
  inr: (paise: unknown) => `₹${((Number(paise) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
  date: (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
  dateTime: (v: unknown) => (v ? new Date(String(v)).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'),
  ago: (v: unknown) => {
    if (!v) return '—';
    const s = Math.round((Date.now() - new Date(String(v)).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  },
  pct: (v: unknown) => `${(Number(v) || 0).toFixed(Number(v) % 1 ? 2 : 0)}%`,
};

/** Shared chart colours: orange accent + neutral greys (CSS variables follow the theme). */
export const CHART = { accent: 'hsl(var(--chart-1))', ink: 'hsl(var(--chart-2))', soft: 'hsl(var(--chart-3))', grey: 'hsl(var(--chart-4))', pale: 'hsl(var(--chart-5))', grid: 'hsl(var(--border))' };
