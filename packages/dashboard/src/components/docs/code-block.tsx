"use client";
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Dark code block with a title bar and a copy button (used on the public /docs page). */
export function CodeBlock({ code, title, lang }: { code: string; title?: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard not available */ }
  };

  return (
    <div className="my-4 rounded-xl border bg-zinc-950 text-zinc-100 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 pl-4 pr-1.5 h-10">
        <span className="text-xs font-medium text-zinc-400 truncate">{title ?? lang ?? 'code'}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 text-[12px] sm:text-[13px] leading-relaxed overflow-x-auto font-mono"><code>{code}</code></pre>
    </div>
  );
}

/** Tabbed variant: one example in several languages (curl / JavaScript / Python). */
export function CodeGroup({ items }: { items: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const item = items[active] ?? items[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard not available */ }
  };

  return (
    <div className="my-4 rounded-xl border bg-zinc-950 text-zinc-100 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-1.5">
        <div className="flex overflow-x-auto" role="tablist" aria-label="Code language">
          {items.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${i === active ? 'border-blue-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 text-[12px] sm:text-[13px] leading-relaxed overflow-x-auto font-mono"><code>{item.code}</code></pre>
    </div>
  );
}
