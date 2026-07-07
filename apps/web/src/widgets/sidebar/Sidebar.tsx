'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Send,
  PlusCircle,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import { routes } from '@/shared/config/routes';

const navItems = [
  { href: routes.inbox, label: 'Входящие', icon: Inbox },
  { href: routes.outbox, label: 'Исходящие', icon: Send },
  { href: routes.newRequest, label: 'Новый запрос', icon: PlusCircle },
  { href: routes.admin.root, label: 'Админ', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <LayoutDashboard className="mr-2 h-5 w-5 text-sidebar-primary" />
        <span className="font-semibold">Request Tracker</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-l-[3px] border-sidebar-primary bg-sidebar-accent pl-[9px] font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
