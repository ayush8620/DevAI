"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BarChart3, Settings, BookOpen, Sun, Moon, Menu, X, ExternalLink, Home, CreditCard, Layers, Trophy, ShieldCheck,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { clerkEnabled } from '@/lib/clerk';
import { Logo as BrandLogo } from '@/components/brand/logo';
import { userApi } from '@/lib/api';

// Admin tools live in the separate panel at /admin. The user dashboard only shows a link to it,
// and only to gateway admins (ADMIN_EMAILS / ADMIN_USER_IDS, answered by GET /user/me).
function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!clerkEnabled) return;
    let alive = true;
    userApi.getMe().then(me => { if (alive) setIsAdmin(Boolean(me?.isAdmin)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return isAdmin;
}

export const DASHBOARD_ROUTES = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  // Bring your own key: every user's requests run only on the keys they add here.
  { href: '/dashboard/pool', label: 'Your keys', icon: Layers },
  { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
  { href: '/dashboard/kits', label: 'Hackathon kits', icon: Trophy },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/api-docs', label: 'Quick reference', icon: BookOpen },
];

const RESOURCES = [
  { href: '/docs', label: 'API docs', icon: BookOpen },
  { href: '/', label: 'DevAI website', icon: Home },
];

function Logo() {
  return (
    <Link href="/" aria-label="DevAI home" className="flex items-center gap-2">
      <BrandLogo markClassName="drop-shadow-[0_4px_12px_rgba(249,115,22,0.30)]" />
      <span className="rounded-full border bg-card/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Console</span>
    </Link>
  );
}

function NavLinks({ pathname, isAdmin }: { pathname: string | null; isAdmin: boolean }) {
  return (
    <>
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">Manage</p>
      <nav className="space-y-1">
        {DASHBOARD_ROUTES.map((route) => {
          const Icon = route.icon;
          const active = route.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(route.href);
          return (
            <Link key={route.href} href={route.href} aria-current={active ? 'page' : undefined} className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}>
              {active && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />}
              <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {route.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-6 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">Resources</p>
      <nav className="space-y-1">
        {RESOURCES.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href} className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <Icon className="h-4 w-4" />
              <span className="flex-1">{r.label}</span>
              <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
            </Link>
          );
        })}
      </nav>
      {isAdmin && (
        <Link href="/admin" className="mt-6 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Admin
        </Link>
      )}
    </>
  );
}

function Footer({ mounted, isDark, toggle }: { mounted: boolean; isDark: boolean; toggle: () => void }) {
  return (
    <div className="border-t p-3 space-y-2">
      {clerkEnabled && (
        <div className="flex items-center gap-3 rounded-lg border bg-background/40 px-3 py-2 min-h-[48px]">
          {/* Account menu: profile, connected Google/GitHub accounts, sign out. */}
          <UserButton showName appearance={{ elements: { userButtonBox: 'flex-row-reverse', userButtonOuterIdentifier: 'text-sm font-medium text-foreground truncate max-w-[150px]' } }} />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs font-medium text-muted-foreground">Theme</span>
        <button
          className="grid h-8 w-8 place-items-center rounded-lg border bg-card hover:bg-muted transition-colors"
          aria-label="Toggle theme"
          onClick={toggle}
        >
          {!mounted ? <span className="block h-4 w-4" /> : isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // The theme is only known in the browser. Rendering the icon before mount made the
  // server HTML (no theme) differ from the first client render → React error #418.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const isDark = mounted && resolvedTheme === 'dark';
  const toggle = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg border bg-card hover:bg-muted"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <Logo />
              <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5"><NavLinks pathname={pathname} isAdmin={isAdmin} /></div>
            <Footer mounted={mounted} isDark={isDark} toggle={toggle} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex h-screen w-64 shrink-0 flex-col border-r bg-card/50 backdrop-blur sticky top-0">
        <div className="flex h-16 items-center border-b px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5"><NavLinks pathname={pathname} isAdmin={isAdmin} /></div>
        <Footer mounted={mounted} isDark={isDark} toggle={toggle} />
      </aside>
    </>
  );
}
