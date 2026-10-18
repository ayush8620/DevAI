export { timeLeft } from '@/lib/kits';

/** Usage bar for a kit cap (requests or tokens). */
export function KitMeter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  if (cap == null) return null;
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  const left = Math.max(cap - used, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono"><span className="font-semibold text-foreground">{left.toLocaleString('en-IN')}</span> / {cap.toLocaleString('en-IN')} left</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${label} used`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function kitStatusBadge(status: string) {
  const cls = status === 'active' ? 'bg-green-500/10 text-ok border-green-500/30'
    : status === 'expired' ? 'bg-amber-500/10 text-warn border-amber-500/30'
    : 'bg-red-500/10 text-bad border-red-500/30';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{status}</span>;
}
