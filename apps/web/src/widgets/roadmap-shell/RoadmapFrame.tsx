'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GitBranch, PanelsTopLeft, Rows3, Settings2 } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';

export function RoadmapFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const isPlanner = pathname === routes.roadmap;

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar dark:bg-background">
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground md:flex">
        <Link href={routes.roadmap} className="flex h-16 items-center gap-3 px-5">
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

        <div className="border-t border-sidebar-border/60 p-3">
          <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-section">Другие пространства</p>
          <Link
            href={routes.workspaces}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <PanelsTopLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
            Переключить пространство
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:rounded-tl-2xl md:border-l md:border-t md:border-border">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary md:hidden">
              <GitBranch className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">Roadmap</p>
              <p className="hidden text-xs text-muted-foreground sm:block">Планирование проектов и загрузки команды</p>
            </div>
          </div>
          <Link
            href={routes.workspaces}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <PanelsTopLeft className="h-4 w-4" strokeWidth={1.6} />
            <span className="hidden sm:inline">Сменить пространство</span>
            <span className="sm:hidden">Пространства</span>
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
