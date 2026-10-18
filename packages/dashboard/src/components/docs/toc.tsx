"use client";
import { useEffect, useState } from 'react';

export interface TocItem { id: string; label: string; sub?: boolean }

/** Sidebar table of contents that highlights the section currently on screen. */
export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map(i => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    const obs = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-80px 0px -65% 0px' });
    els.forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">On this page</p>
      <ul className="space-y-1 border-l">
        {items.map(i => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={`-ml-px block border-l py-1 transition-colors ${i.sub ? 'pl-6 text-[13px]' : 'pl-4'} ${active === i.id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
