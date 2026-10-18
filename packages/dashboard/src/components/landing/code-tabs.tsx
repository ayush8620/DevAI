"use client";
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CodeTab {
  id: string;
  label: string;
  code: string;
}

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const [copied, setCopied] = useState(false);
  const tab = tabs.find(t => t.id === active) ?? tabs[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard not available */ }
  };

  return (
    <div className="rounded-xl border bg-code text-code-foreground shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-code-border px-2">
        <div className="flex overflow-x-auto" role="tablist" aria-label="Code examples">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab.id}
              onClick={() => setActive(t.id)}
              className={`px-3 sm:px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${t.id === tab.id ? 'border-primary text-code-foreground' : 'border-transparent text-code-muted hover:text-code-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={copy} className="m-2 p-1.5 rounded bg-code-hover text-code-muted hover:text-code-foreground shrink-0" aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="p-4 sm:p-5 text-[12px] sm:text-[13px] leading-relaxed overflow-x-auto font-mono"><code>{tab.code}</code></pre>
    </div>
  );
}
