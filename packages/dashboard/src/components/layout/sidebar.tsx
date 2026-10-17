"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Server, FolderKanban, BarChart3, Settings, BookOpen, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export const DASHBOARD_ROUTES = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/providers', label: 'Providers', icon: Server },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
  { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/api-docs', label: 'API Docs', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser. Rendering the icon before mount made the
  // server HTML (no theme) differ from the first client render → React error #418.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card text-card-foreground sticky top-0">
      <div className="p-6">
        <Link href="/" className="text-xl font-bold tracking-tight hover:text-primary transition-colors">DevAI Gateway</Link>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <nav className="space-y-2">
          {DASHBOARD_ROUTES.map((route) => {
            const Icon = route.icon;
            const active = route.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(route.href);
            return (
              <Link key={route.href} href={route.href} className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:text-primary",
                active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
              )}>
                <Icon className="h-4 w-4" />
                {route.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t flex items-center justify-between">
        <span className="text-sm font-medium">Theme</span>
        <button
          className="p-2 border rounded-md"
          aria-label="Toggle theme"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {!mounted ? <span className="block h-4 w-4" /> : isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
