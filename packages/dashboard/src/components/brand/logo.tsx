"use client";
import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * DevAI mark: one node branching to three (a request routed across providers/keys) on the
 * brand gradient. Same drawing as public/brand/devai-mark.svg and src/app/icon.svg.
 * useId keeps the gradient id unique, so a copy inside a hidden (display:none) menu never
 * breaks the others.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = `devai-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="0.55" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <g fill="none" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 32H27" />
        <path d="M27 32C35 32 35 19 43 19" />
        <path d="M27 32H43" />
        <path d="M27 32C35 32 35 45 43 45" />
      </g>
      <circle cx="17" cy="32" r="6" fill="#FFFFFF" />
      <g fill="#FFFFFF">
        <circle cx="46" cy="19" r="4.25" />
        <circle cx="46" cy="32" r="4.25" />
        <circle cx="46" cy="45" r="4.25" />
      </g>
    </svg>
  );
}

/** Wordmark "DevAI": "Dev" in the text colour, "AI" in the landing-page blue → cyan gradient. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg font-bold tracking-tight', className)}>
      Dev<span className="bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">AI</span>
    </span>
  );
}

/** Mark + wordmark, as used in the nav bars, sidebar and sign-in shell. */
export function Logo({ className, markClassName, wordClassName }: { className?: string; markClassName?: string; wordClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <Wordmark className={wordClassName} />
    </span>
  );
}
