import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/sidebar';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage your DevAI provider keys, projects, usage and billing.',
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash flex min-h-screen flex-col lg:flex-row bg-background text-foreground">
      <Sidebar />
      <main className="relative flex-1 min-w-0">
        {/* Soft glow + grid, same as the landing page hero */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden">
          <div className="absolute left-1/2 top-[-14rem] h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] opacity-30" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
