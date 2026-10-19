"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Sun, Moon, ArrowLeft, KeyRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { clerkEnabled } from '@/lib/clerk';
import { LogoMark } from '@/components/brand/logo';
import { ADMIN_ROUTES } from '@/lib/admin/routes';


function Brand() {
  return (
    <Link href="/admin" aria-label="DevAI Admin home" className="flex items-center gap-2">
      <LogoMark className="h-7 w-7" />
      <span className="text-base font-bold tracking-tight">Dev<span className="text-[#F97316]">AI</span> <span className="font-semibold text-muted-foreground">Admin</span></span>
    </Link>
  );
}

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="space-y-0.5" aria-label="Admin">
      {ADMIN_ROUTES.map(r => {
        const active = r.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(r.href);
        const Icon = r.icon;
        return (
          <Link key={r.href} href={r.href} aria-current={active ? 'page' : undefined} className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}>
            <Icon className={cn('h-4 w-4', active ? 'text-[#F97316]' : '')} />
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children, email, keyMode }: { children: React.ReactNode; email: string | null; keyMode: boolean }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  const isDark = mounted && resolvedTheme === 'dark';
  const current = ADMIN_ROUTES.find(r => (r.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(r.href)));

  const sidebar = (
    <>
      <div className="flex h-14 items-center border-b px-4"><Brand /></div>
      <div className="flex-1 overflow-y-auto p-3"><Nav pathname={pathname} /></div>
      <div className="border-t p-3 space-y-1">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    </>
  );

  return (
    <div className="dash admin flex min-h-screen bg-background text-foreground">
      <aside className="hidden lg:flex sticky top-0 h-screen w-60 shrink-0 flex-col border-r bg-card">{sidebar}</aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r bg-card shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-2.5 grid h-9 w-9 place-items-center rounded-md hover:bg-muted" aria-label="Close menu"><X className="h-4 w-4" /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="lg:hidden grid h-9 w-9 place-items-center rounded-md border hover:bg-muted" aria-label="Open menu" aria-expanded={open}><Menu className="h-4 w-4" /></button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden sm:inline text-sm font-semibold">DevAI Admin</span>
            {current && <><span className="hidden sm:inline text-muted-foreground">/</span><span className="truncate text-sm text-muted-foreground">{current.label}</span></>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {keyMode && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 px-2.5 py-1 text-[11px] font-medium text-warn" title="Clerk is not configured: calls use the admin key saved on the System page">
                <KeyRound className="h-3 w-3" /> Admin key mode
              </span>
            )}
            {email && <span className="hidden md:inline text-xs text-muted-foreground">{email}</span>}
            <button className="grid h-9 w-9 place-items-center rounded-md border hover:bg-muted" aria-label="Toggle theme" onClick={() => setTheme(isDark ? 'light' : 'dark')}>
              {!mounted ? <span className="block h-4 w-4" /> : isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {clerkEnabled && <UserButton />}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
