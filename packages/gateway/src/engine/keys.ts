/**
 * Multi-key selection: decides in which order a provider's API keys are tried.
 * Every strategy only changes the ORDER. Keys in cooldown are always moved to the
 * end (and skipped by the strategy runner), and a failing key always falls through
 * to the next key of the same provider before DevAI moves on to another provider.
 */
export const KEY_STRATEGIES = ['failover', 'round_robin', 'random', 'least_used'] as const;
export type KeyStrategy = typeof KEY_STRATEGIES[number];

export function isKeyStrategy(v: unknown): v is KeyStrategy {
  return typeof v === 'string' && (KEY_STRATEGIES as readonly string[]).includes(v);
}

export interface KeyOrderContext {
  /** Credential ids in the admin-defined priority order (unlisted keys keep their original order, after these) */
  priority?: string[];
  /** Ids of keys that are cooling down; they go last */
  cooling?: Set<string>;
  /** Monotonic counter for round_robin (per provider) */
  counter?: number;
  /** Requests per key in the current window, for least_used */
  usage?: Record<string, number>;
  /** Injectable RNG for tests */
  random?: () => number;
}

/** Apply the admin priority list: listed ids first (in that order), the rest after in input order. */
export function byPriority<T extends { credentialId: string }>(keys: T[], priority: string[] = []): T[] {
  const rank = new Map(priority.map((id, i) => [id, i]));
  return keys
    .map((k, i) => ({ k, i, r: rank.has(k.credentialId) ? rank.get(k.credentialId)! : priority.length + i }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.k);
}

export function orderKeys<T extends { credentialId: string }>(keys: T[], strategy: KeyStrategy, ctx: KeyOrderContext = {}): T[] {
  const base = byPriority(keys, ctx.priority);
  const healthy = base.filter(k => !ctx.cooling?.has(k.credentialId));
  const cooling = base.filter(k => ctx.cooling?.has(k.credentialId));
  let ordered: T[];
  switch (strategy) {
    case 'round_robin': {
      const n = healthy.length;
      const start = n ? (((ctx.counter ?? 0) % n) + n) % n : 0;
      ordered = [...healthy.slice(start), ...healthy.slice(0, start)];
      break;
    }
    case 'random': {
      const rnd = ctx.random ?? Math.random;
      ordered = [...healthy];
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
      break;
    }
    case 'least_used': {
      const u = ctx.usage ?? {};
      // stable sort: ties keep priority order
      ordered = healthy.map((k, i) => ({ k, i })).sort((a, b) => ((u[a.k.credentialId] ?? 0) - (u[b.k.credentialId] ?? 0)) || a.i - b.i).map(x => x.k);
      break;
    }
    default:
      ordered = healthy;
  }
  return [...ordered, ...cooling];
}

/** Show a key as prefix + last 4 (e.g. "AIza…DyMg"); never more than 8 real characters. */
export function maskSecret(key: string | null | undefined): string {
  if (!key) return '••••';
  const k = key.trim();
  if (k.length <= 8) return '••••';
  const prefixLen = k.length >= 20 ? 4 : 2;
  return `${k.slice(0, prefixLen)}…${k.slice(-4)}`;
}
