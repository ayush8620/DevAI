import { cn } from '@/lib/utils';

const ROUTE = 'M16 46V18H31C41 18 47 25 47 32 47 39 41 46 31 46H29C22.5 46 22.5 32 29 32H33';

/**
 * DevAI mark: "loop-route D". An outlined rounded tile (no fill) with a D-shaped route that
 * loops back in to an orange dot. Same drawing as public/brand/devai-mark.svg; the tile and
 * route use currentColor, so they are black on the light theme and white on the dark theme.
 * (src/app/icon.svg is a filled, heavier favicon cut.)
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8 shrink-0 text-neutral-950 dark:text-white', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title ? <title>{title}</title> : null}
      <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d={ROUTE} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36.5" cy="32" r="4.4" fill="#F97316" />
      <circle cx="16" cy="46" r="4.4" fill="currentColor" />
    </svg>
  );
}

/** Wordmark "DevAI": "Dev" in the text colour, "AI" in the brand orange. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg font-bold tracking-tight', className)}>
      Dev<span className="text-[#F97316]">AI</span>
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
