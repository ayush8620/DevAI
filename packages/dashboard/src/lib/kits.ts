/** Human countdown to a kit's end time. */
export function timeLeft(expiresAt: string, now = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `${Math.floor(h / 24)} days left`;
  if (h >= 1) return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m left`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}
