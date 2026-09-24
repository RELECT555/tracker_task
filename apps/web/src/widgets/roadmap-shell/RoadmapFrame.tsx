'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check, ChevronUp, GitBranch, LogIn, LogOut, Monitor, Moon, PanelsTopLeft, Rows3, Settings2, Sun, Users } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { DEV_ACCOUNTS } from '@/features/auth/lib/dev-accounts';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';

function initials(fullName: string) {
  return fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function ProfileMenu({ mobile = false }: { mobile?: boolean }) {
  const { user, isAuthenticated, logout, switchUser, isSwitchingUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = user?.fullName ?? 'Dev-пользователь';
  const displayEmail = user?.email ?? 'без JWT (DEV_USER_ID)';
  const primaryRole = user?.roles[0] ?? 'dev';

  async function handleSwitchUser(email: string) {
    if (email === user?.email || isSwitchingUser) return;
    setMenuOpen(false);
    await switchUser(email);
  }

  return (
    <div className={cn('relative', mobile ? 'md:hidden' : 'hidden md:block')}>
      <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Профиль пользователя" className={cn('flex items-center gap-3 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/30 text-left transition-colors hover:bg-sidebar-accent/50', mobile ? 'h-9 w-9 justify-center p-0' : 'w-full px-3 py-2.5')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-primary">{initials(displayName)}</div>
        {!mobile ? <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
          <p className="truncate text-xs text-sidebar-muted">{displayEmail}</p>
          <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-muted">{primaryRole}</span>
        </div> : null}
        {!mobile ? <ChevronUp className={cn('h-4 w-4 shrink-0 text-sidebar-muted transition-transform', menuOpen && 'rotate-180')} strokeWidth={1.5} /> : null}
      </button>
      {menuOpen ? <div className={cn('absolute z-50 max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-sidebar-border/50 bg-sidebar shadow-lg', mobile ? 'right-0 top-full mt-2 w-72' : 'bottom-full left-0 right-0 mb-1')}>
        <div className="border-b border-sidebar-border/40 px-3 py-2"><p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted"><Users className="h-3 w-3" strokeWidth={1.5} />Сменить пользователя</p></div>
        {DEV_ACCOUNTS.map((account) => {
          const active = account.email === user?.email;
          return <button key={account.email} type="button" disabled={isSwitchingUser || active} onClick={() => void handleSwitchUser(account.email)} className={cn('flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors', active ? 'bg-sidebar-accent/40 text-sidebar-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent/50', isSwitchingUser && 'opacity-60')}>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{account.name}</p><p className="truncate text-[11px] text-sidebar-muted">{account.label} · {account.hint}</p></div>
            {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" strokeWidth={1.5} /> : null}
          </button>;
        })}
        <div className="border-t border-sidebar-border/40">{isAuthenticated ? <button type="button" onClick={() => { setMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"><LogOut className="h-4 w-4" strokeWidth={1.5} />Выйти</button> : <Link href={routes.login} onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"><LogIn className="h-4 w-4" strokeWidth={1.5} />Войти</Link>}</div>
      </div> : null}
    </div>
  );
}

export function RoadmapFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const isAdmin = isAdminUser(user);
  const isPlanner = pathname === routes.roadmap;
  useEffect(() => setThemeMounted(true), []);
  const themeLabel = !themeMounted ? 'Системная' : theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Системная';
  const ThemeIcon = !themeMounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const index = order.indexOf((theme as (typeof order)[number]) ?? 'system');
    setTheme(order[(index + 1) % order.length]);
  };
  const breadcrumbs = [
    { label: 'Roadmap', href: routes.roadmap },
    ...(pathname.startsWith(routes.roadmapAdminHome) ? [{ label: 'Администрирование', href: routes.roadmapAdminHome }] : []),
    ...(pathname === routes.roadmapAdminUsers ? [{ label: 'Пользователи' }] : []),
    ...(pathname === routes.roadmapAdminRoles ? [{ label: 'Роли' }] : []),
    ...(pathname === routes.roadmapAdmin ? [{ label: 'Интеграции' }] : []),
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar dark:bg-background">
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground md:flex">
        <Link href={routes.workspaces} title="Рабочие пространства" className="flex h-16 items-center gap-3 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border/60 bg-sidebar-accent text-sidebar-primary">
            <GitBranch className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">Roadmap</span>
            <span className="block text-[10px] uppercase tracking-[0.13em] text-sidebar-muted">Планирование</span>
          </span>
        </Link>

        <nav className="flex-1 px-3 py-5">
          <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-section">Рабочее пространство</p>
          <Link
            href={routes.roadmap}
            aria-current={isPlanner ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isPlanner ? 'bg-sidebar-accent font-medium text-sidebar-primary' : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}
          >
            <Rows3 className="h-[18px] w-[18px]" strokeWidth={1.5} />
            План проекта
          </Link>

          {isAdmin ? (
            <>
              <p className="mb-2 mt-7 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-section">Администрирование</p>
              <Link
                href={routes.roadmapAdminHome}
                aria-current={pathname.startsWith(routes.roadmapAdminHome) ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${pathname.startsWith(routes.roadmapAdminHome) ? 'bg-sidebar-accent font-medium text-sidebar-primary' : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}
              >
                <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                Администрирование
              </Link>
            </>
          ) : null}
        </nav>

        <div className="border-t border-sidebar-border/60 p-3"><ProfileMenu /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:rounded-tl-2xl md:border-l md:border-t md:border-border">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary md:hidden">
              <GitBranch className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <nav aria-label="Хлебные крошки" className="min-w-0 overflow-x-auto">
              <ol className="flex items-center gap-2 whitespace-nowrap text-sm">
                {breadcrumbs.map((crumb, index) => <li key={crumb.label} className="flex items-center gap-2">
                  {index ? <span aria-hidden="true" className="text-muted-foreground/50">/</span> : null}
                  {'href' in crumb ? <Link href={crumb.href} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className={index === breadcrumbs.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground transition-colors hover:text-foreground'}>{crumb.label}</Link> : <span aria-current="page" className="font-semibold text-foreground">{crumb.label}</span>}
                </li>)}
              </ol>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={routes.workspaces} title="Сменить рабочее пространство" aria-label="Сменить рабочее пространство" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground transition-colors hover:bg-muted sm:px-3">
              <PanelsTopLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Сменить пространство</span>
            </Link>
            <button type="button" onClick={cycleTheme} title={`Тема: ${themeLabel}`} aria-label={`Тема: ${themeLabel}. Нажмите, чтобы переключить`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted">
              <ThemeIcon className="h-4 w-4" />
            </button>
            <ProfileMenu mobile />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
