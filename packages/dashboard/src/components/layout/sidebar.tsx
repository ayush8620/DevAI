"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Server, FolderKanban, BarChart3, Settings, BookOpen, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
// Assuming simplified button usage or native
export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const routes = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/providers', label: 'Providers', icon: Server },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/usage', label: 'Usage', icon: BarChart3 },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/api-docs', label: 'API Docs', icon: BookOpen },
  ];

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card text-card-foreground">
      <div className="p-6">
        <h2 className="text-xl font-bold tracking-tight">DevAI Gateway</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <nav className="space-y-2">
          {routes.map((route) => {
            const Icon = route.icon;
            const active = pathname === route.href;
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
        <button className="p-2 border rounded-md" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}