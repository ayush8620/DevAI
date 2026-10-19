import {
  LayoutDashboard, Users, CreditCard, Ticket, Server, FolderKanban, BarChart3, Layers, ScrollText, Activity,
} from 'lucide-react';

/** The admin panel's own navigation (separate from the user dashboard sidebar). */
export const ADMIN_ROUTES = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/coupons', label: 'Promo codes', icon: Ticket },
  { href: '/admin/providers', label: 'Shared providers', icon: Server },
  { href: '/admin/projects', label: 'Admin projects', icon: FolderKanban },
  { href: '/admin/usage', label: 'Usage', icon: BarChart3 },
  { href: '/admin/pool', label: 'Key pool & kits', icon: Layers },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { href: '/admin/system', label: 'System', icon: Activity },
] as const;
