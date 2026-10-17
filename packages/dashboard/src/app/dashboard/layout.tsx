import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/sidebar';

export const metadata: Metadata = {
  title: 'DevAI Gateway Dashboard',
  description: 'Admin dashboard for DevAI Gateway',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
