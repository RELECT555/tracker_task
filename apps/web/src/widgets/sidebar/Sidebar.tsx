'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Send,
  PlusCircle,
  LayoutDashboard,
  Settings,
  ChevronUp,
} from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';

const navSections = [
  {
    title: 'Рабочее пространство',
    items: [
      { href: routes.inbox, label: 'Входящие', icon: Inbox },
      { href: routes.outbox, label: 'Исходящие', icon: Send },
      { href: routes.newRequest, label: 'Новый запрос', icon: PlusCircle },
    ],
  },
  {
    title: 'Администрирование',
    items: [{ href: routes.admin.root, label: 'Админ', icon: Settings }],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== routes.admin.root && pathname.startsWith(`${href}/`));
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-full w-[var(--sidebar-width)] shrink-0 flex-col bg-sidebar text-sidebar-foreground"
      style={{ '--sidebar-width': '16rem' } as React.CSSProperties}
    >
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border/60">
          <LayoutDashboard className="h-4 w-4 text-sidebar-primary" strokeWidth={1.5} />
        </div>
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-sidebar-foreground">
          Tracker
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-section">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
                      active
                        ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                        : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0',
                        active ? 'text-sidebar-primary' : 'text-sidebar-muted',
                      )}
                      strokeWidth={1.5}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/30 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-primary">
            А
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">Администратор</p>
            <p className="truncate text-xs text-sidebar-muted">admin@tracker.local</p>
            <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-muted">
              Admin
            </span>
          </div>
          <ChevronUp className="h-4 w-4 shrink-0 text-sidebar-muted" strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
