'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Activity, ChartNoAxesCombined, ChevronDown, ChevronsUpDown, GitBranch, House, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Rows3, Settings2, Sun, type LucideIcon } from 'lucide-react';
import { RoadmapProjectSelection } from '@/entities/roadmap/model/roadmap-project-selection';
import { useAuth } from '@/features/auth/model/useAuth';
import { ProductTour } from '@/features/product-tour/ui/ProductTour';
import { TourLauncherIcon } from '@/features/product-tour/ui/TourLauncher';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { roadmapAdminSections } from '@/shared/config/roadmap-admin-sections';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { NOTIFICATION_SUMMARY_KEY, NotificationBell } from './NotificationBell';

const SIDEBAR_STORAGE_KEY = 'roadmap:sidebar-collapsed';
const ADMIN_LABEL = 'Администрирование';
// Страховка, если переход отменили и pathname так и не сменился.
const PENDING_NAVIGATION_TIMEOUT = 10_000;

const roadmapLinks = [
  { href: routes.home, label: 'Главная', icon: House },
  { href: routes.roadmap, label: 'План проекта', icon: Rows3 },
  { href: routes.roadmapAnalytics, label: 'Аналитика', icon: ChartNoAxesCombined },
];

const syncLink = { href: routes.roadmapSync, label: 'Синхронизация', icon: Activity };

const isAnalyticsPath = (path: string) => path === routes.roadmapAnalytics || path.startsWith(`${routes.roadmapAnalytics}/`);

function initials(fullName: string) {
  return fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function ProfileMenu({ auth, mobile = false, collapsed = false }: {
  auth: ReturnType<typeof useAuth>;
  mobile?: boolean;
  collapsed?: boolean;
}) {
  const { user, logout } = auth;
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const compact = mobile || collapsed;

  useEffect(() => setMenuOpen(false), [pathname]);

  if (!user) return null;
  const { fullName: displayName, email: displayEmail } = user;

  return (
    <div
      className={cn('relative', mobile ? 'md:hidden' : 'hidden md:block')}
      onKeyDown={(event) => {
        if (menuOpen && event.key === 'Escape') {
          event.stopPropagation();
          setMenuOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button ref={trigger} type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Профиль пользователя" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} title={collapsed ? displayName : undefined} className={cn('flex items-center text-left transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-primary', mobile ? 'size-9 justify-center rounded-full border border-border bg-card hover:bg-muted' : cn('rounded-lg hover:bg-sidebar-accent/60', menuOpen && 'bg-sidebar-accent/60', collapsed ? 'h-11 w-full justify-center' : 'w-full gap-2.5 px-2 py-2'))}>
        <span className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', mobile ? 'size-7 bg-primary/15 text-[11px] text-primary' : 'size-8 bg-sidebar-primary/15 text-xs text-sidebar-primary ring-1 ring-sidebar-primary/25')}>{initials(displayName)}</span>
        {!compact ? <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium text-sidebar-foreground">{displayName}</span>
          <span className="mt-0.5 block truncate text-xs text-sidebar-muted">{displayEmail}</span>
        </span> : null}
        {!compact ? <ChevronsUpDown className="size-4 shrink-0 text-sidebar-muted" strokeWidth={1.5} aria-hidden="true" /> : null}
      </button>
      {menuOpen ? <div id={menuId} className={cn('absolute z-50 max-h-[min(24rem,70vh)] roadmap-scrollbar overflow-y-auto rounded-lg border border-sidebar-border/50 bg-sidebar shadow-lg', mobile ? 'right-0 top-full mt-2 w-72' : collapsed ? 'bottom-0 left-full ml-2 w-72' : 'bottom-full left-0 right-0 mb-1')}>
        {compact ? <div className="border-b border-sidebar-border/40 px-3 py-2">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
          <p className="truncate text-xs text-sidebar-muted">{displayEmail}</p>
        </div> : null}
        <button type="button" onClick={() => { setMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"><LogOut className="h-4 w-4" strokeWidth={1.5} />Выйти</button>
      </div> : null}
    </div>
  );
}

type RoadmapNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed?: boolean;
  className?: string;
};

function RoadmapNavLink({ href, label, icon: Icon, active, collapsed, className }: RoadmapNavItem) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      data-nav-current={active ? '' : undefined}
      className={cn(
        'group/nav relative flex h-9 items-center rounded-lg text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-primary',
        collapsed ? 'justify-center' : 'gap-3 px-3',
        active ? 'font-medium text-sidebar-foreground' : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        className,
      )}
    >
      <Icon className={cn('size-[18px] shrink-0 transition-colors duration-200', active ? 'text-sidebar-primary' : 'text-sidebar-muted group-hover/nav:text-sidebar-foreground')} strokeWidth={active ? 1.8 : 1.5} aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function NavSectionLabel({ label, collapsed, first = false }: { label: string; collapsed: boolean; first?: boolean }) {
  if (collapsed) return first ? null : <li role="presentation" aria-hidden="true" className="mx-auto my-3 h-px w-6 bg-sidebar-border" />;
  return (
    <li role="presentation" className={cn('px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-sidebar-section/80', !first && 'pt-5')}>
      {label}
    </li>
  );
}

export function RoadmapFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pageContent = useRef<HTMLDivElement>(null);
  const navList = useRef<HTMLDivElement>(null);
  const navIndicator = useRef<HTMLSpanElement>(null);
  const lastPathname = useRef(pathname);
  // Куда пользователь только что кликнул: меню переключается сразу,
  // не дожидаясь ответа сервера на переход.
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const navPath = pendingPath ?? pathname;
  const isPlanPage = pathname === routes.roadmap;
  const isAdmin = isAdminUser(auth.user);
  // Same query as the bell: it decides whether the sync problems page is open to this user.
  const notificationSummary = useQuery({ queryKey: NOTIFICATION_SUMMARY_KEY, queryFn: roadmapApi.notificationSummary, enabled: Boolean(auth.user) });
  const workspaceLinks = notificationSummary.data?.canViewSyncProblems ? [...roadmapLinks, syncLink] : roadmapLinks;
  const isAdminHome = pathname === routes.roadmapAdminHome;
  const activeAdminSection = roadmapAdminSections.find(({ href }) => pathname === href);
  const isAdminSection = isAdminHome || pathname.startsWith(`${routes.roadmapAdminHome}/`);
  const isNavAdminSection = navPath === routes.roadmapAdminHome || navPath.startsWith(`${routes.roadmapAdminHome}/`);
  const [adminMenuOpen, setAdminMenuOpen] = useState(Boolean(activeAdminSection));

  useLayoutEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    setPendingPath(null);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const animation = pageContent.current?.animate?.([
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'none' },
    ], {
      duration: 260,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    });
    return () => animation?.cancel();
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setPendingPath(url.pathname);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!pendingPath) return;
    const timer = window.setTimeout(() => setPendingPath(null), PENDING_NAVIGATION_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [pendingPath]);

  useLayoutEffect(() => {
    const list = navList.current;
    const indicator = navIndicator.current;
    if (!list || !indicator) return;

    const place = () => {
      const target = list.querySelector<HTMLElement>('[data-nav-current]');
      if (!target || target.closest('[inert]')) {
        indicator.style.opacity = '0';
        return;
      }
      const listBox = list.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      // Из скрытого состояния подложка не едет через всё меню, а проявляется на месте.
      const appearing = indicator.style.opacity !== '1';
      if (appearing) indicator.style.transition = 'opacity 160ms ease';
      indicator.style.transform = `translate(${box.left - listBox.left}px, ${box.top - listBox.top}px)`;
      indicator.style.width = `${box.width}px`;
      indicator.style.height = `${box.height}px`;
      indicator.style.opacity = '1';
      if (appearing) {
        indicator.getBoundingClientRect();
        indicator.style.transition = '';
      }
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [navPath, sidebarCollapsed, adminMenuOpen, isAdmin]);

  useEffect(() => setThemeMounted(true), []);
  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
    } catch {
      // Keep the default when browser storage is unavailable.
    }
  }, []);
  useEffect(() => {
    if (activeAdminSection) setAdminMenuOpen(true);
  }, [activeAdminSection]);
  const toggleSidebar = () => {
    const nextCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(nextCollapsed);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextCollapsed));
    } catch {
      // Toggling still works without browser storage.
    }
  };
  const sidebarToggleLabel = sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const themeLabel = !themeMounted ? 'Системная' : theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Системная';
  const ThemeIcon = !themeMounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const index = order.indexOf((theme as (typeof order)[number]) ?? 'system');
    setTheme(order[(index + 1) % order.length]);
  };
  const breadcrumbs = [
    { label: 'Главная', href: routes.home },
    ...(isPlanPage ? [{ label: 'План проекта' }] : []),
    ...(isAdminSection ? [{ label: ADMIN_LABEL, href: isAdminHome ? undefined : routes.roadmapAdminHome }] : []),
    ...(isAnalyticsPath(pathname) ? [{ label: 'Аналитика' }] : []),
    ...(pathname === routes.roadmapSync ? [{ label: 'Синхронизация' }] : []),
    ...(activeAdminSection ? [{ label: activeAdminSection.title }] : []),
  ];

  return (
    <div className="roadmap-frame relative flex h-dvh overflow-clip bg-sidebar dark:bg-background">
      <ProductTour enabled={Boolean(auth.user)} isAdmin={isAdmin} />
      <aside id="roadmap-sidebar" className={cn('hidden h-full shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground md:flex', sidebarCollapsed ? 'w-16' : 'w-64')}>
        <div className={cn('flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/60', sidebarCollapsed ? 'justify-center' : 'justify-between pl-4 pr-2.5')}>
          {sidebarCollapsed ? (
            <button
              type="button"
              title={sidebarToggleLabel}
              aria-label={sidebarToggleLabel}
              aria-expanded={false}
              aria-controls="roadmap-sidebar"
              onClick={toggleSidebar}
              className="group/brand relative flex size-9 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/25 transition-colors hover:bg-sidebar-primary/25 focus-visible:outline-2 focus-visible:outline-sidebar-primary"
            >
              <GitBranch className="size-5 transition-opacity group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0" strokeWidth={1.7} aria-hidden="true" />
              <SidebarToggleIcon className="absolute size-5 opacity-0 transition-opacity group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100" strokeWidth={1.6} aria-hidden="true" />
            </button>
          ) : (
            <Link href={routes.home} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-sidebar-primary">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/25">
                <GitBranch className="size-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold tracking-tight text-sidebar-foreground">Roadmap</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-[0.13em] text-sidebar-muted">Планирование</span>
              </span>
            </Link>
          )}
          {!sidebarCollapsed ? (
            <button
              type="button"
              title={sidebarToggleLabel}
              aria-label={sidebarToggleLabel}
              aria-expanded={!sidebarCollapsed}
              aria-controls="roadmap-sidebar"
              onClick={toggleSidebar}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-primary"
            >
              <SidebarToggleIcon className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <nav aria-label="Навигация Roadmap" data-tour="nav" className={cn('min-h-0 flex-1 roadmap-scrollbar overflow-auto py-5', sidebarCollapsed ? 'px-2.5' : 'px-3')}>
          <div ref={navList} className="relative">
            <span ref={navIndicator} aria-hidden="true" className="roadmap-nav-indicator rounded-lg bg-sidebar-accent">
              <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
            </span>
            <ul className="space-y-0.5">
              <NavSectionLabel label="Рабочее пространство" collapsed={sidebarCollapsed} first />
              {workspaceLinks.map((link) => (
                <li key={link.href}>
                  <RoadmapNavLink {...link} active={navPath === link.href || (link.href === routes.roadmapAnalytics && isAnalyticsPath(navPath))} collapsed={sidebarCollapsed} />
                </li>
              ))}
              {isAdmin ? <NavSectionLabel label="Управление" collapsed={sidebarCollapsed} /> : null}
              {isAdmin ? (
                <li>
                  <div data-tour="nav-admin" className={cn('flex items-center rounded-lg transition-colors duration-200', isNavAdminSection && 'bg-sidebar-accent/50')}>
                    <RoadmapNavLink
                      href={routes.roadmapAdminHome}
                      label={ADMIN_LABEL}
                      icon={Settings2}
                      active={navPath === routes.roadmapAdminHome}
                      collapsed={sidebarCollapsed}
                      className={cn('min-w-0 flex-1', !sidebarCollapsed && 'gap-2.5 pr-1', isNavAdminSection && 'text-sidebar-primary')}
                    />
                    {!sidebarCollapsed ? (
                      <button
                        type="button"
                        aria-label="Разделы администрирования"
                        aria-expanded={adminMenuOpen}
                        aria-controls="roadmap-admin-navigation"
                        onClick={() => setAdminMenuOpen((open) => !open)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-primary"
                      >
                        <ChevronDown className={cn('size-4 motion-safe:transition-transform', adminMenuOpen && 'rotate-180')} strokeWidth={1.7} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  {!sidebarCollapsed ? (
                    <div inert={!adminMenuOpen} className={cn('grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]', adminMenuOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                      <div className="min-h-0 overflow-hidden">
                        <ul id="roadmap-admin-navigation" className="ml-[1.3rem] mt-0.5 space-y-0.5 border-l border-sidebar-border/80 pl-2">
                          {roadmapAdminSections.map(({ id, href, title, icon }) => (
                            <li key={id}>
                              <RoadmapNavLink href={href} label={title} icon={icon} active={navPath === href} className="h-8 gap-2.5 px-2.5 text-[13px]" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </li>
              ) : null}
            </ul>
          </div>
        </nav>

        <div className="shrink-0 border-t border-sidebar-border/60 px-2.5 py-2.5">
          <ProfileMenu auth={auth} collapsed={sidebarCollapsed} />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background md:rounded-tl-2xl md:border-l md:border-t md:border-border dark:md:rounded-tl-none dark:md:border-l-0 dark:md:border-t-0">
        <header className="relative flex min-h-16 shrink-0 items-center justify-between gap-x-2 border-b border-border bg-card px-3 py-1 sm:gap-x-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex md:hidden">
              <GitBranch className="size-5" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <nav aria-label="Хлебные крошки" className="min-w-0">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
                {breadcrumbs.map((crumb, index) => <li key={crumb.label} className="flex items-center gap-2">
                  {index ? <span aria-hidden="true" className="text-muted-foreground/50">/</span> : null}
                  {'href' in crumb && crumb.href ? <Link href={crumb.href} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className={index === breadcrumbs.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground transition-colors hover:text-foreground'}>{crumb.label}</Link> : <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className={index === breadcrumbs.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{crumb.label}</span>}
                </li>)}
              </ol>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isPlanPage ? (
              <Link href={routes.roadmapAnalytics} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:hidden">
                Аналитика
              </Link>
            ) : null}
            {isAdmin && !isAdminSection ? (
              <Link href={routes.roadmapAdminHome} prefetch={pathname === routes.home ? false : undefined} aria-label={ADMIN_LABEL} title={ADMIN_LABEL} className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:hidden">
                <Settings2 className="size-4" strokeWidth={1.7} aria-hidden="true" />
              </Link>
            ) : null}
            <NotificationBell />
            <TourLauncherIcon />
            <button type="button" data-tour="theme" onClick={cycleTheme} title={`Тема: ${themeLabel}`} aria-label={`Тема: ${themeLabel}. Нажмите, чтобы переключить`} className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <ThemeIcon className="size-4" aria-hidden="true" />
            </button>
            <ProfileMenu auth={auth} mobile />
          </div>
          {pendingPath ? <span aria-hidden="true" className="roadmap-nav-progress pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary" /> : null}
        </header>
        <div ref={pageContent} data-pending={pendingPath ? '' : undefined} className="roadmap-page flex min-h-0 flex-1 flex-col">
          {auth.user ? <RoadmapProjectSelection key={auth.user.id} userId={auth.user.id}>{children}</RoadmapProjectSelection> : null}
        </div>
      </div>
    </div>
  );
}
