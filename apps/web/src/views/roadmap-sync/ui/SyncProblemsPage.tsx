'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronRight } from 'lucide-react';
import type { SyncProblemDto, SyncProblemEpisodeDto, SyncProblemStatusFilter } from '@tracker/shared';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { ApiError } from '@/shared/api/client';
import { buttonVariants } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { ALERT_KIND_ICON } from '@/widgets/roadmap-shell/notification-icons';
import { PROBLEM_STATUS_META, durationLabel, recurrenceLabel, relativeTime } from '@/widgets/roadmap-shell/notification-view';
import { parseSyncQuery, serializeSyncQuery, type SyncProblemsFilter } from '../model/sync-problems-query';

const POLL_MS = 60_000;
const STATUS_TABS: { id: SyncProblemStatusFilter; label: string }[] = [
  { id: 'active', label: 'Активные' },
  { id: 'resolved', label: 'Исправленные' },
  { id: 'all', label: 'Все' },
];

const exactTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Shared view of Azure DevOps sync problems (sync problems page spec §7.1). */
export function SyncProblemsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseSyncQuery(new URLSearchParams(searchParams.toString()));

  const setFilter = (next: SyncProblemsFilter) => router.replace(`${pathname}${serializeSyncQuery(next)}`, { scroll: false });

  const problems = useInfiniteQuery({
    queryKey: ['roadmap', 'sync-problems', filter.status, filter.projectId],
    queryFn: ({ pageParam }) =>
      roadmapApi.syncProblems({ status: filter.status, projectId: filter.projectId ?? undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const firstPage = problems.data?.pages[0];
  const items = problems.data?.pages.flatMap((page) => page.items) ?? [];
  const forbidden = problems.error instanceof ApiError && problems.error.status === 403;
  const active = firstPage?.counts.active ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Проблемы синхронизации</h1>
        <p className="text-sm text-muted-foreground">
          {firstPage ? (active ? `Активных: ${active}` : 'Активных проблем нет') : 'Что сломано в синхронизации с Azure DevOps сейчас и что было за 90 дней.'}
        </p>
      </header>

      {forbidden ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Нет доступа к проблемам синхронизации</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Статус" className="inline-flex w-full rounded-lg border border-border bg-card p-0.5 sm:w-auto">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter.status === tab.id}
                  onClick={() => setFilter({ ...filter, status: tab.id })}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:flex-none',
                    filter.status === tab.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="shrink-0">Проект</span>
              <select
                value={filter.projectId ?? ''}
                onChange={(event) => setFilter({ ...filter, projectId: event.target.value || null })}
                className="h-9 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:w-56"
              >
                <option value="">Все проекты</option>
                {(firstPage?.projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {problems.isPending ? (
            <SkeletonStatus label="Загружаем проблемы синхронизации" className="space-y-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </SkeletonStatus>
          ) : problems.error && !items.length ? (
            <QueryErrorNotice title="Не удалось загрузить проблемы синхронизации" queries={[problems]} />
          ) : !items.length ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {filter.status === 'active' ? 'Всё работает — активных проблем синхронизации нет' : 'За последние 90 дней проблем не было'}
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <ProblemRow key={item.alertId} item={item} />
              ))}
            </ul>
          )}

          {problems.error && items.length ? <QueryErrorNotice title="Не удалось обновить список" queries={[problems]} /> : null}
          {problems.hasNextPage ? (
            <div className="text-center">
              <button
                type="button"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                disabled={problems.isFetchingNextPage}
                onClick={() => void problems.fetchNextPage()}
              >
                {problems.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ProblemRow({ item }: { item: SyncProblemDto }) {
  const meta = PROBLEM_STATUS_META[item.status];
  const Icon = ALERT_KIND_ICON[item.kind];
  const [showBody, setShowBody] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const recurrence = recurrenceLabel(item.recurrence7d);
  const when =
    item.status === 'active' || !item.resolvedAt
      ? `открыта ${relativeTime(item.openedAt)}`
      : `длилась ${durationLabel(item.openedAt, item.resolvedAt)} · ${item.status === 'fixed' ? 'исправлено' : 'закрыто'} ${relativeTime(item.resolvedAt)} в ${clockTime(item.resolvedAt)}`;
  const peak =
    item.peakCount !== null && item.currentCount !== null && item.peakCount > item.currentCount ? `макс. ${item.peakCount}` : null;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <span aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', meta.bgClass, meta.textClass)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h2 className="min-w-0 text-pretty wrap-anywhere text-sm font-semibold leading-5">{item.title}</h2>
            <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.bgClass, meta.textClass)}>
              {item.status === 'fixed' ? <Check aria-hidden="true" className="size-3" /> : <span aria-hidden="true" className={cn('size-1.5 rounded-full', meta.dotClass)} />}
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {item.projectName ? `${item.projectName} · ` : ''}
            <time dateTime={item.resolvedAt ?? item.openedAt} title={exactTime(item.resolvedAt ?? item.openedAt)}>
              {when}
            </time>
            {recurrence ? ` · ${recurrence}` : ''}
            {peak ? ` · ${peak}` : ''}
          </p>
          {item.body ? (
            <button
              type="button"
              onClick={() => setShowBody((value) => !value)}
              aria-expanded={showBody}
              className={cn(
                'block w-full rounded-md bg-muted px-2 py-1.5 text-left font-mono text-xs leading-4 text-muted-foreground wrap-anywhere',
                showBody ? '' : 'line-clamp-2',
              )}
            >
              {item.body}
            </button>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground/80">{item.hint}</p>
            {item.action ? (
              <Link href={item.action.link} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full shrink-0 sm:w-auto')}>
                {item.action.label}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null}
          </div>
          {item.historyCount > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                aria-expanded={showHistory}
                className="inline-flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', showHistory && 'rotate-90')} />
                История ({item.historyCount})
              </button>
              {showHistory ? <ProblemHistory alertId={item.alertId} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ProblemHistory({ alertId }: { alertId: string }) {
  const history = useQuery({ queryKey: ['roadmap', 'sync-problems', 'history', alertId], queryFn: () => roadmapApi.syncProblemHistory(alertId) });
  if (history.isPending) return <Skeleton className="mt-2 h-3 w-1/2" />;
  if (history.error) return <QueryErrorNotice title="Не удалось загрузить историю" queries={[history]} className="mt-2" />;
  return (
    <ul className="mt-2 space-y-1 border-l border-border pl-3">
      {history.data.items.map((episode) => (
        <li key={episode.episodeId} className="text-xs text-muted-foreground">
          {episodeLine(episode)}
        </li>
      ))}
    </ul>
  );
}

function episodeLine(episode: SyncProblemEpisodeDto): string {
  const opened = `открыта ${exactTime(episode.openedAt)}`;
  if (!episode.resolvedAt) return `${opened} · не закрыта`;
  const ending = episode.resolution === 'obsolete' ? 'больше не актуально' : 'исправлено';
  return `${opened} · длилась ${durationLabel(episode.openedAt, episode.resolvedAt)} · ${ending}`;
}
