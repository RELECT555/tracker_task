'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { ChartNoAxesCombined, ChevronDown, ChevronUp, GitBranch, House, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Rows3, Settings2, Sun, type LucideIcon } from 'lucide-react';
import { RoadmapProjectSelection } from '@/entities/roadmap/model/roadmap-project-selection';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { roadmapAdminSections } from '@/shared/config/roadmap-admin-sections';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';

const SIDEBAR_STORAGE_KEY = 'roadmap:sidebar-collapsed';
const ADMIN_LABEL = 'Администрирование';
const RoadmapTopbarContext = createContext<HTMLDivElement | null>(null);

const roadmapLinks = [
  { href: routes.home, label: 'Главная', icon: House },
  { href: routes.roadmap, label: 'План проекта', icon: Rows3 },
  { href: routes.roadmapAnalytics, label: 'Аналитика', icon: ChartNoAxesCombined },
];

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
      <button ref={trigger} type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Профиль пользователя" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} title={collapsed ? displayName : undefined} className={cn('flex items-center gap-3 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/30 text-left transition-colors hover:bg-sidebar-accent/50 focus-visible:outline-2 focus-visible:outline-sidebar-primary', mobile ? 'size-9 justify-center' : collapsed ? 'h-10 w-full justify-center' : 'w-full px-3 py-2.5')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-primary">{initials(displayName)}</div>
        {!compact ? <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
          <p className="truncate text-xs text-sidebar-muted">{displayEmail}</p>
        </div> : null}
        {!compact ? <ChevronUp className={cn('h-4 w-4 shrink-0 text-sidebar-muted transition-transform', menuOpen && 'rotate-180')} strokeWidth={1.5} aria-hidden="true" /> : null}
      </button>
      {menuOpen ? <div id={menuId} className={cn('absolute z-50 max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-sidebar-border/50 bg-sidebar shadow-lg', mobile ? 'right-0 top-full mt-2 w-72' : collapsed ? 'bottom-0 left-full ml-2 w-72' : 'bottom-full left-0 right-0 mb-1')}>
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
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 items-center rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-primary',
        collapsed ? 'justify-center' : 'gap-3 px-3',
        active ? 'bg-sidebar-accent font-medium text-sidebar-primary' : 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        className,
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function RoadmapTopbar({ children }: { children: ReactNode }) {
  const container = useContext(RoadmapTopbarContext);
  return container ? createPortal(children, container) : null;
}

export function RoadmapFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [topbarContent, setTopbarContent] = useState<HTMLDivElement | null>(null);
  const isPlanPage = pathname === routes.roadmap;
  const isAdmin = isAdminUser(auth.user);
  const isAdminHome = pathname === routes.roadmapAdminHome;
  const activeAdminSection = roadmapAdminSections.find(({ href }) => pathname === href);
  const isAdminSection = isAdminHome || pathname.startsWith(`${routes.roadmapAdminHome}/`);
  const [adminMenuOpen, setAdminMenuOpen] = useState(Boolean(activeAdminSection));
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
    ...(pathname === routes.roadmapAnalytics ? [{ label: 'Аналитика' }] : []),
    ...(activeAdminSection ? [{ label: activeAdminSection.title }] : []),
  ];

  return (
    <div className="roadmap-frame relative flex h-dvh overflow-clip bg-sidebar dark:bg-background">
      <aside id="roadmap-sidebar" className={cn('hidden h-full shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground md:flex', sidebarCollapsed ? 'w-16' : 'w-64')}>
        <div className={cn('flex h-16 shrink-0 items-center gap-2', sidebarCollapsed ? 'justify-center' : 'justify-between pl-5 pr-3')}>
          <Link href={routes.home} className={cn('flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-sidebar-primary', sidebarCollapsed && 'hidden')}>
            <span className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border/60 bg-sidebar-accent text-sidebar-primary">
              <GitBranch className="size-5" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">Roadmap</span>
              <span className="block text-[10px] uppercase tracking-[0.13em] text-sidebar-muted">Планирование</span>
            </span>
          </Link>
          <button
            type="button"
            title={sidebarToggleLabel}
            aria-label={sidebarToggleLabel}
            aria-expanded={!sidebarCollapsed}
            aria-controls="roadmap-sidebar"
            onClick={toggleSidebar}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-primary"
          >
            <SidebarToggleIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Навигация Roadmap" className={cn('min-h-0 flex-1 overflow-auto py-5', sidebarCollapsed ? 'px-2.5' : 'px-3')}>
          <ul className="space-y-1">
            {roadmapLinks.map((link) => (
              <li key={link.href}>
                <RoadmapNavLink {...link} active={pathname === link.href} collapsed={sidebarCollapsed} />
              </li>
            ))}
            {isAdmin ? (
              <li>
                <div className={cn('flex items-center rounded-lg', isAdminSection && 'bg-sidebar-accent/50')}>
                  <RoadmapNavLink
                    href={routes.roadmapAdminHome}
                    label={ADMIN_LABEL}
                    icon={Settings2}
                    active={isAdminHome}
                    collapsed={sidebarCollapsed}
                    className={cn('min-w-0 flex-1', !sidebarCollapsed && 'gap-2.5 pr-1', isAdminSection && 'text-sidebar-primary')}
                  />
                  {!sidebarCollapsed ? (
                    <button
                      type="button"
                      aria-label="Разделы администрирования"
                      aria-expanded={adminMenuOpen}
                      aria-controls="roadmap-admin-navigation"
                      onClick={() => setAdminMenuOpen((open) => !open)}
                      className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-primary"
                    >
                      <ChevronDown className={cn('size-4 motion-safe:transition-transform', adminMenuOpen && 'rotate-180')} strokeWidth={1.7} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {!sidebarCollapsed ? (
                  <ul id="roadmap-admin-navigation" hidden={!adminMenuOpen} className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                    {roadmapAdminSections.map(({ id, href, title, icon }) => (
                      <li key={id}>
                        <RoadmapNavLink href={href} label={title} icon={icon} active={pathname === href} className="h-9 gap-2.5 px-2.5" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ) : null}
          </ul>
        </nav>

        <div className={cn('shrink-0 border-t border-sidebar-border/60 py-3', sidebarCollapsed ? 'px-2.5' : 'px-3')}>
          <ProfileMenu auth={auth} collapsed={sidebarCollapsed} />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background md:rounded-tl-2xl md:border-l md:border-t md:border-border dark:md:rounded-tl-none dark:md:border-l-0 dark:md:border-t-0">
        <header className={cn('flex min-h-16 shrink-0 items-center justify-between gap-x-2 gap-y-2 border-b border-border bg-card px-3 py-3 sm:gap-x-4 sm:px-6', isPlanPage && 'flex-wrap')}>
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
          {isPlanPage ? <div ref={setTopbarContent} className="order-last w-full empty:hidden lg:order-none lg:w-auto" /> : null}
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && !isAdminSection ? (
              <Link href={routes.roadmapAdminHome} aria-label={ADMIN_LABEL} title={ADMIN_LABEL} className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:hidden">
                <Settings2 className="size-4" strokeWidth={1.7} aria-hidden="true" />
              </Link>
            ) : null}
            <button type="button" onClick={cycleTheme} title={`Тема: ${themeLabel}`} aria-label={`Тема: ${themeLabel}. Нажмите, чтобы переключить`} className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <ThemeIcon className="size-4" aria-hidden="true" />
            </button>
            <ProfileMenu auth={auth} mobile />
          </div>
        </header>
        <RoadmapTopbarContext.Provider value={topbarContent}>
          {auth.user ? <RoadmapProjectSelection key={auth.user.id} userId={auth.user.id}>{children}</RoadmapProjectSelection> : null}
        </RoadmapTopbarContext.Provider>
      </div>
    </div>
  );
}
