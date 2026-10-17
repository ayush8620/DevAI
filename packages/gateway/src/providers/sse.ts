import { ProviderHttpError } from './base.js';

/**
 * Read a Server-Sent Events body and yield each `data:` payload (multi-line data joined).
 * - Aborting `signal` cancels the upstream body.
 * - `idleTimeoutMs` fails the stream if the upstream goes silent for that long.
 */
export async function* readSSE(res: Response, opts: { signal?: AbortSignal; idleTimeoutMs?: number } = {}): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => { reader.cancel().catch(() => {}); };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  let buffer = '';
  let data: string[] = [];
  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout(reader, opts.idleTimeoutMs);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line === '') {
          if (data.length) { yield data.join('\n'); data = []; }
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
        // other fields (event:, id:, retry:, comments) are not needed
      }
    }
    buffer += decoder.decode();
    if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, '').replace(/\r?\n$/, ''));
    if (data.length) yield data.join('\n');
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    reader.cancel().catch(() => {});
  }
}

async function readWithIdleTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, idleMs?: number) {
  if (!idleMs) return reader.read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const e: any = new Error(`timeout: no data from provider for ${idleMs}ms`);
          e.name = 'TimeoutError';
          reject(e);
        }, idleMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Throw a ProviderHttpError for a non-2xx upstream response (with retry hints when the provider gives them). */
export async function throwForStatus(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const err = await res.json().catch(() => ({} as any));
  throw providerError(err, res.status, label, res.headers.get('retry-after'));
}

/** Parse "30", "1.5" or an HTTP date into seconds. */
export function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, (t - Date.now()) / 1000) : undefined;
}

/** Google "18005s" / "1.5s" durations. */
function parseDuration(v: unknown): number | undefined {
  const m = typeof v === 'string' ? v.match(/^([\d.]+)s$/) : null;
  return m ? Number(m[1]) : undefined;
}

export function providerError(body: any, status: number, label: string, retryAfterHeader?: string | null): ProviderHttpError {
  const e = body?.error ?? body ?? {};
  const message = e?.message || body?.message || `${label} error ${status}`;
  const details: any[] = Array.isArray(e?.details) ? e.details : [];
  const retryInfo = details.find(d => String(d?.['@type'] || '').endsWith('RetryInfo'));
  const quota = details.find(d => String(d?.['@type'] || '').endsWith('QuotaFailure'));
  const perModel = quota?.violations?.some((v: any) => v?.quotaDimensions?.model || /PerModel/i.test(String(v?.quotaId || '')));
  return new ProviderHttpError(message, status, {
    retryAfterSec: parseRetryAfter(retryAfterHeader) ?? parseDuration(retryInfo?.retryDelay),
    limitScope: perModel ? 'model' : undefined,
  });
}
