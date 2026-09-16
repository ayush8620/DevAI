const fs = require('fs');
const path = require('path');

const files = {
  'package.json': `{
  "name": "@devai/dashboard",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^3.4.0",
    "@tailwindcss/typography": "^0.5.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.460.0",
    "recharts": "^2.15.0",
    "next-themes": "^0.4.0",
    "sonner": "^1.7.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "@radix-ui/react-alert-dialog": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
  'next.config.ts': `import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
};
export default nextConfig;`,
  'tailwind.config.ts': `import type { Config } from "tailwindcss";
export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;`,
  'postcss.config.mjs': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`,
  'src/app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}`,
  'src/lib/utils.ts': `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`,
  'src/lib/api.ts': `export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || 'dev-admin-key';

const fetchApi = async (path: string, options?: RequestInit) => {
  const url = \`\${API_URL}\${path}\`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${ADMIN_KEY}\`,
    ...(options?.headers || {})
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    throw new Error(\`API Error: \${response.statusText}\`);
  }
  
  return response.json();
};

export const api = {
  getOverview: () => fetchApi('/admin/analytics/overview'),
  getRecentRequests: () => fetchApi('/admin/analytics/recent-requests'),
  getAnalyticsByProvider: () => fetchApi('/admin/analytics/by-provider'),
  getAnalyticsByModel: () => fetchApi('/admin/analytics/by-model'),
  getAnalyticsByProject: () => fetchApi('/admin/analytics/by-project'),
  
  getProviders: () => fetchApi('/admin/providers'),
  createProvider: (data: any) => fetchApi('/admin/providers', { method: 'POST', body: JSON.stringify(data) }),
  deleteProvider: (id: string) => fetchApi(\`/admin/providers/\${id}\`, { method: 'DELETE' }),
  testProvider: (id: string) => fetchApi(\`/admin/providers/\${id}/test\`, { method: 'POST' }),
  
  getCredentials: (id: string) => fetchApi(\`/admin/providers/\${id}/credentials\`),
  createCredential: (id: string, data: any) => fetchApi(\`/admin/providers/\${id}/credentials\`, { method: 'POST', body: JSON.stringify(data) }),
  updateCredential: (id: string, data: any) => fetchApi(\`/admin/credentials/\${id}\`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCredential: (id: string) => fetchApi(\`/admin/credentials/\${id}\`, { method: 'DELETE' }),
  testCredential: (id: string) => fetchApi(\`/admin/credentials/\${id}/test\`, { method: 'POST' }),
  
  getProjects: () => fetchApi('/admin/projects'),
  createProject: (data: any) => fetchApi('/admin/projects', { method: 'POST', body: JSON.stringify(data) }),
  deleteProject: (id: string) => fetchApi(\`/admin/projects/\${id}\`, { method: 'DELETE' }),
  
  getApiKeys: (projectId: string) => fetchApi(\`/admin/projects/\${projectId}/api-keys\`),
  createApiKey: (projectId: string, data: any) => fetchApi(\`/admin/projects/\${projectId}/api-keys\`, { method: 'POST', body: JSON.stringify(data) }),
  deleteApiKey: (id: string) => fetchApi(\`/admin/api-keys/\${id}\`, { method: 'DELETE' }),
  
  getAuditLogs: () => fetchApi('/admin/audit-logs'),
  getHealth: () => fetchApi('/v1/health'),
};`,
  'src/components/layout/sidebar.tsx': `"use client";
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
}`,
  'src/components/layout/theme-provider.tsx': `"use client";
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children, ...props }: any) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}`,
  'src/app/layout.tsx': `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Sidebar } from '@/components/layout/sidebar';
// import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DevAI Gateway Dashboard',
  description: 'Admin dashboard for DevAI Gateway',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background">
              {children}
            </main>
          </div>
          {/* <Toaster /> */}
        </ThemeProvider>
      </body>
    </html>
  );
}`,
  'src/app/page.tsx': `"use client";
import { useEffect, useState } from 'react';
import { Activity, Zap, Database, Clock } from 'lucide-react';
import { api } from '@/lib/api';

export default function Dashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOverview().catch(() => ({ requestsToday: 0, tokensToday: 0, cacheHitRate: 0, avgLatencyMs: 0 })),
      api.getRecentRequests().catch(() => [])
    ]).then(([o, r]) => {
      setOverview(o);
      setRequests(r);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[ 
          { title: 'Requests Today', value: overview?.requestsToday, icon: Activity },
          { title: 'Tokens Today', value: overview?.tokensToday, icon: Zap },
          { title: 'Cache Hit Rate', value: overview?.cacheHitRate ? \`\${overview.cacheHitRate}%\` : '0%', icon: Database },
          { title: 'Avg Latency', value: overview?.avgLatencyMs ? \`\${overview.avgLatencyMs}ms\` : '0ms', icon: Clock }
        ].map((stat, i) => (
          <div key={i} className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 flex flex-row items-center justify-between pb-2">
              <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{stat.title}</h3>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-6 pt-0">
              {loading ? <div className="h-8 w-20 bg-muted animate-pulse rounded" /> : <div className="text-2xl font-bold">{stat.value || 0}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6">
          <h3 className="font-semibold leading-none tracking-tight">Recent Requests</h3>
        </div>
        <div className="p-6 pt-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Model</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Provider</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Latency</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tokens</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Cache</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b transition-colors"><td colSpan={7} className="p-4"><div className="h-6 w-full bg-muted animate-pulse rounded" /></td></tr>
                  ))
                ) : requests.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">No recent requests</td></tr>
                ) : (
                  requests.map((r: any) => (
                    <tr key={r.requestId} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</td>
                      <td className="p-4 align-middle">{r.model}</td>
                      <td className="p-4 align-middle">{r.provider}</td>
                      <td className="p-4 align-middle"><span className={\`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold \${r.status < 400 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}\`}>{r.status}</span></td>
                      <td className="p-4 align-middle">{r.latencyMs}ms</td>
                      <td className="p-4 align-middle">{r.totalTokens}</td>
                      <td className="p-4 align-middle"><span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">{r.cacheHit ? 'Hit' : 'Miss'}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}`
};

Object.entries(files).forEach(([filepath, content]) => {
  const fullPath = path.join(__dirname, filepath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Created:', filepath);
});
