'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { roadmapApi, type RoadmapProjectPlan } from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { useRoadmapProject } from '@/entities/roadmap/model/roadmap-project-selection';
import { useRoadmapCatalog } from '@/entities/roadmap/model/use-roadmap-catalog';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { parseQuarterKey, shiftQuarter, type QuarterRef } from '../model/analytics';
import type { RoleLookup } from './analytics-ui';
import styles from './analytics.module.css';

export type AnalyticsView = 'capacity' | 'progress';

const views = [
  { key: 'capacity', label: 'Загрузка квартала', href: routes.roadmapAnalytics },
  { key: 'progress', label: 'Прогресс проекта', href: routes.roadmapAnalyticsProgress },
] as const satisfies readonly { key: AnalyticsView; label: string; href: string }[];

export type AnalyticsContext = { plan: RoadmapProjectPlan; roles: RoleLookup; quarter: QuarterRef; projectKey: string };

function QuarterSwitcher({ quarter, onShift }: { quarter: QuarterRef; onShift: (offset: number) => void }) {
  return <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-card px-0.5 dark:border-border" role="group" aria-label="Выбор квартала">
    <Button type="button" variant="ghost" size="icon" className="size-8 text-foreground" aria-label="Предыдущий квартал" onClick={() => onShift(-1)}><ChevronLeft className="size-4" /></Button>
    <span className="min-w-18 whitespace-nowrap text-center text-sm font-semibold tabular-nums" aria-live="polite">{quarter.label}</span>
    <Button type="button" variant="ghost" size="icon" className="size-8 text-foreground" aria-label="Следующий квартал" onClick={() => onShift(1)}><ChevronRight className="size-4" /></Button>
  </div>;
}

function ViewTabs({ view, query }: { view: AnalyticsView; query: string }) {
  return <nav aria-label="Разделы аналитики" data-tour="analytics-tabs" className="flex w-full rounded-lg border border-border/70 bg-card p-0.5 sm:w-fit dark:border-border">
    {views.map((item) => {
      const active = item.key === view;
      return <Link
        key={item.key}
        href={query ? `${item.href}?${query}` : item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-9 flex-1 items-center justify-center rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:flex-none',
          active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >{item.label}</Link>;
    })}
  </nav>;
}

/** Общий каркас обеих страниц аналитики: шапка, вкладки, выбор проекта и загрузка плана. */
export function AnalyticsShell({ view, children }: { view: AnalyticsView; children: (context: AnalyticsContext) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const quarterParam = searchParams.get('q');
  const quarter = useMemo(() => parseQuarterKey(quarterParam), [quarterParam]);
  const shift = (offset: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('q', shiftQuarter(quarter, offset).key);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  const { user } = useAuth();
  const { projects, azureQuery: projectsQuery, localQuery, loading: catalogLoading } = useRoadmapCatalog(isAdminUser(user) && !isRoadmapDemoMode());
  const { project, ready: projectSelectionReady, selectProject } = useRoadmapProject(projects, { catalogLoading: projectsQuery.isLoading });
  const roadmapProjectId = project?.roadmapId ?? '';

  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const plan = planQuery.isError ? undefined : planQuery.data;
  const roles = useMemo<RoleLookup>(() => {
    const lookup: RoleLookup = new Map((plan?.roles ?? []).map((role) => [role.id, role]));
    for (const item of plan?.workItems ?? []) {
      for (const allocation of item.allocations) {
        if (!lookup.has(allocation.roleId)) lookup.set(allocation.roleId, allocation.role);
      }
    }
    return lookup;
  }, [plan]);

  const error = localQuery.error ?? projectsQuery.error ?? planQuery.error;
  const loading = !projectSelectionReady || catalogLoading || (projectsQuery.isLoading && !project) || planQuery.isLoading;
  const syncTimestamp = Date.parse(plan?.syncedAt ?? '');
  const syncedAt = Number.isFinite(syncTimestamp) ? new Date(syncTimestamp) : null;
  const showQuarter = view === 'capacity';

  return <main className={cn(styles.dashboard, 'roadmap-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-none px-4 py-4 sm:px-6 sm:py-6 lg:px-8')}>
    <div className={cn(styles.content, 'w-full space-y-4')}>
      <header className={cn(styles.header, !showQuarter && styles.headerCompact)}>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[30px]">Аналитика</h1>
          {plan ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {syncedAt ? <>Синхронизация <time dateTime={syncedAt.toISOString()}>{syncedAt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</time></> : 'Проект ещё не синхронизирован'}
          </p> : null}
        </div>
        {showQuarter ? <QuarterSwitcher quarter={quarter} onShift={shift} /> : null}
        <AzureProjectPicker projects={projects} value={project?.id ?? ''} onChange={selectProject} disabled={catalogLoading || !projectSelectionReady} placeholder="Выбрать проект" className={styles.projectPicker} />
      </header>

      <ViewTabs view={view} query={quarterParam ? `q=${encodeURIComponent(quarterParam)}` : ''} />

      <QueryErrorNotice title="Не удалось загрузить аналитику" queries={[localQuery, projectsQuery, ...(roadmapProjectId ? [planQuery] : [])]} />

      {loading ? <SkeletonStatus label="Загрузка аналитики" className="space-y-4">
        <Skeleton className="h-28 rounded-xl border border-border/70 bg-card dark:bg-card" />
        <div className={styles.columns}><Skeleton className="h-80 rounded-xl border border-border/70 bg-card dark:bg-card" /><Skeleton className="h-80 rounded-xl border border-border/70 bg-card dark:bg-card" /></div>
      </SkeletonStatus> : plan ? children({ plan, roles, quarter, projectKey: roadmapProjectId }) : !error ? <Card className="px-4 py-8 text-center shadow-none">
        <p className="font-semibold">{projects.length ? 'Проект ещё не импортирован' : 'Пока нет проектов'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{projects.length ? 'Выберите импортированный проект для просмотра аналитики.' : 'Импортируйте проект в Roadmap, чтобы увидеть его метрики.'}</p>
      </Card> : null}
    </div>
  </main>;
}
