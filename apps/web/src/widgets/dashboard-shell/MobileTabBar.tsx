'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Inbox, Menu, PlusCircle, Send } from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { useSidebarDrawer } from './sidebar-drawer-context';

const TABS = [
  { href: routes.inbox, label: 'Входящие', icon: Inbox },
  { href: routes.outbox, label: 'Мои', icon: Send },
  { href: routes.newRequest, label: 'Создать', icon: PlusCircle },
  { href: routes.notifications, label: 'Уведомления', icon: Bell },
] as const;

function isTabActive(pathname: string, href: string) {
  if (href === routes.outbox) {
    return (
      pathname === href || pathname.startsWith(`${href}/`) || pathname === routes.newRequest
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { setOpen } = useSidebarDrawer();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-sidebar-border/60 bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm supports-[backdrop-filter]:bg-sidebar/85 md:hidden"
      aria-label="Основная навигация"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isTabActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px]"
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-sidebar-primary" />
            )}
            <Icon
              className={cn('h-[22px] w-[22px]', active ? 'text-sidebar-primary' : 'text-sidebar-muted')}
              strokeWidth={active ? 2.2 : 1.8}
            />
            <span
              className={cn(
                'font-medium tracking-tight',
                active ? 'text-sidebar-primary' : 'text-sidebar-muted',
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px]"
      >
        <Menu className="h-[22px] w-[22px] text-sidebar-muted" strokeWidth={1.8} />
        <span className="font-medium tracking-tight text-sidebar-muted">Ещё</span>
      </button>
    </nav>
  );
}
