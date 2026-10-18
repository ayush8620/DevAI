import Link from 'next/link';
import { ArrowRight, Github } from 'lucide-react';
import { clerkEnabled, SIGN_IN_URL } from '@/lib/clerk';
import { Logo, LogoMark } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export const GITHUB = 'https://github.com/ayush8620/DevAI';

const NAV = [
  { href: '/#features', label: 'Features' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
];

/** Top bar shared by the public pages (landing, /docs, /pricing). */
export function SiteHeader({ active, badge, wide }: { active?: '/docs' | '/pricing'; badge?: React.ReactNode; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className={`mx-auto flex h-16 items-center justify-between px-5 sm:px-8 ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}>
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="DevAI home" className="flex items-center">
            <Logo />
          </Link>
          {badge}
        </div>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className={n.href === active ? 'text-foreground font-medium' : 'hover:text-foreground transition-colors'}>{n.label}</Link>
          ))}
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {clerkEnabled && (
            <Link href={SIGN_IN_URL} className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
          )}
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary-hover">
            <span className="hidden sm:inline">Open dashboard</span><span className="sm:hidden">Dashboard</span> <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {/* Small screens: the section links as a scrollable row */}
      <nav className="md:hidden flex gap-5 overflow-x-auto border-t px-5 py-2 text-sm text-muted-foreground">
        {NAV.map(n => (
          <Link key={n.href} href={n.href} className={`whitespace-nowrap ${n.href === active ? 'text-foreground font-medium' : 'hover:text-foreground'}`}>{n.label}</Link>
        ))}
        <a href={GITHUB} target="_blank" rel="noreferrer" className="whitespace-nowrap hover:text-foreground">GitHub</a>
      </nav>
    </header>
  );
}

export function SiteFooter({ wide }: { wide?: boolean }) {
  return (
    <footer className="border-t px-5 sm:px-8 py-8">
      <div className={`mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}>
        <p className="inline-flex flex-wrap items-center justify-center gap-2"><Link href="/" aria-label="DevAI home" className="inline-flex"><LogoMark className="h-6 w-6" /></Link> DevAI Gateway · Built by <a href="https://ayushyadav.dev" target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-primary">Ayush Yadav</a></p>
        <div className="flex flex-wrap items-center justify-center gap-5">
          <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
          <Link href="/docs" className="hover:text-foreground">Docs</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground"><Github className="h-4 w-4" /> GitHub</a>
        </div>
      </div>
    </footer>
  );
}
