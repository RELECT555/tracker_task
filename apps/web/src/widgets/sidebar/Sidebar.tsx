'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Home,
  Inbox,
  Send,
  Bell,
  Settings,
  ChevronUp,
  LogIn,
  LogOut,
  Users,
  Check,
  Search,
} from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { DEV_ACCOUNTS } from '@/features/auth/lib/dev-accounts';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { WayoMark } from '@/shared/ui/wayo-mark';

// re-export path already has DEV_ACCOUNTS

const workspaceSection = {
  title: 'Рабочее пространство',
  items: [
    { href: routes.home, label: 'Главная', icon: Home },
    { href: routes.inbox, label: 'Входящие', icon: Inbox },
    { href: routes.outbox, label: 'Исходящие', icon: Send },
    { href: routes.search, label: 'Поиск', icon: Search },
    { href: routes.notifications, label: 'Уведомления', icon: Bell },
  ],
};

const adminSection = {
  title: 'Администрирование',
  items: [{ href: routes.admin.root, label: 'Панель администратора', icon: Settings }],
};

function isActive(pathname: string, href: string) {
  if (href === routes.admin.root) {
    return pathname === href || pathname.startsWith('/admin/');
  }
  if (href === routes.outbox) {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      pathname === routes.newRequest
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user, isAuthenticated, logout, switchUser, isSwitchingUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = user?.fullName ?? 'Dev-пользователь';
  const displayEmail = user?.email ?? 'без JWT (DEV_USER_ID)';
  const primaryRole = user?.roles[0] ?? 'dev';
  const navSections = isAdminUser(user)
    ? [workspaceSection, adminSection]
    : [workspaceSection];

  async function handleSwitchUser(email: string) {
    if (email === user?.email || isSwitchingUser) return;
    setMenuOpen(false);
    await switchUser(email);
  }

  return (
    <aside
      className={cn(
        'flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground dark:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.6)]',
        className,
      )}
      style={{ '--sidebar-width': '16rem' } as React.CSSProperties}
    >
      <div className="flex h-16 items-center gap-3 px-5">
        <WayoMark
          framed
          className="h-8 w-8 border-sidebar-border/60 bg-sidebar-accent text-sidebar-primary"
          title="Wayo"
        />
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Wayo
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        {navSections.map((section) => (
          <div
            key={section.title}
            data-tour={section === workspaceSection ? 'sidebar-nav' : undefined}
          >
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
                    onClick={onNavigate}
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

      <div className="relative p-3">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/30 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-primary">
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
            <p className="truncate text-xs text-sidebar-muted">{displayEmail}</p>
            <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-muted">
              {primaryRole}
            </span>
          </div>
          <ChevronUp
            className={cn(
              'h-4 w-4 shrink-0 text-sidebar-muted transition-transform',
              menuOpen && 'rotate-180',
            )}
            strokeWidth={1.5}
          />
        </button>

        {menuOpen ? (
          <div className="absolute bottom-full left-3 right-3 mb-1 max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-sidebar-border/50 bg-sidebar shadow-lg">
            <div className="border-b border-sidebar-border/40 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
                <Users className="h-3 w-3" strokeWidth={1.5} />
                Сменить пользователя
              </p>
            </div>
            {DEV_ACCOUNTS.map((account) => {
              const active = account.email === user?.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  disabled={isSwitchingUser || active}
                  onClick={() => void handleSwitchUser(account.email)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent/40 text-sidebar-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                    isSwitchingUser && 'opacity-60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="truncate text-[11px] text-sidebar-muted">
                      {account.label} · {account.hint}
                    </p>
                  </div>
                  {active ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" strokeWidth={1.5} />
                  ) : null}
                </button>
              );
            })}
            <div className="border-t border-sidebar-border/40">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                  Выйти
                </button>
              ) : (
                <Link
                  href={routes.login}
                  onClick={() => {
                    setMenuOpen(false);
                    onNavigate?.();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
                >
                  <LogIn className="h-4 w-4" strokeWidth={1.5} />
                  Войти
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
