'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronRight, CircleCheck, Clock3, FolderKanban, History } from 'lucide-react';
import type { SyncProblemDto, SyncProblemEpisodeDto, SyncProblemStatusFilter } from '@tracker/shared';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { ApiError } from '@/shared/api/client';
import { buttonVariants } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { ALERT_KIND_ICON } from '@/widgets/roadmap-shell/notification-icons';
import { PROBLEM_STATUS_META, durationLabel, recurrenceLabel, relativeTime, titleWithoutProject } from '@/widgets/roadmap-shell/notification-view';
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
    <main className="roadmap-scrollbar relative min-h-0 flex-1 space-y-4 overflow-auto overscroll-none px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Проблемы синхронизации</h1>
          {firstPage ? (
            <span
              role="status"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                active ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}
            >
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', active ? 'bg-destructive' : 'bg-emerald-500')} />
              {active ? `Активных: ${active}` : 'Активных проблем нет'}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 max-w-2xl text-pretty text-sm text-muted-foreground">
          Что сломано в синхронизации с Azure DevOps сейчас и что было за последние 90 дней.
        </p>
      </header>

      {forbidden ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Нет доступа к проблемам синхронизации</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label="Статус"
              onKeyDown={(event) => {
                const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!dir) return;
                event.preventDefault();
                const index = STATUS_TABS.findIndex((tab) => tab.id === filter.status);
                const next = STATUS_TABS[(index + dir + STATUS_TABS.length) % STATUS_TABS.length];
                setFilter({ ...filter, status: next.id });
                (event.currentTarget.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
              }}
              className="inline-flex w-full gap-0.5 rounded-lg border border-border bg-card p-0.5 sm:w-auto"
            >
              {STATUS_TABS.map((tab) => {
                const selected = filter.status === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    data-tab={tab.id}
                    tabIndex={selected ? 0 : -1}
                    aria-selected={selected}
                    onClick={() => setFilter({ ...filter, status: tab.id })}
                    className={cn(
                      'inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:flex-none',
                      selected ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                    {tab.id === 'active' && active > 0 ? (
                      <span className="rounded-full bg-destructive px-1.5 text-xs font-medium leading-5 text-white tabular-nums">{active}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <SearchableSelect
              ariaLabel="Проект"
              value={filter.projectId ?? ''}
              onChange={(value) => setFilter({ ...filter, projectId: value || null })}
              options={[{ value: '', label: 'Все проекты' }, ...(firstPage?.projects ?? []).map((project) => ({ value: project.id, label: project.name }))]}
              searchable={(firstPage?.projects.length ?? 0) > 8}
              className="w-full sm:w-60"
            />
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
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CircleCheck className="size-5" />
              </span>
              <p className="text-sm font-medium">{filter.status === 'active' ? 'Всё работает' : 'Здесь пока пусто'}</p>
              <p className="max-w-sm text-pretty text-sm text-muted-foreground">
                {filter.status === 'active'
                  ? 'Активных проблем синхронизации нет. Если что-то сломается, оно появится здесь.'
                  : 'За последние 90 дней подходящих проблем не было.'}
              </p>
            </div>
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
    </main>
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
  const title = titleWithoutProject(item.title, item.projectName);
  // The hint and the shortcut tell how to fix an open problem; they are noise once it is resolved.
  const isActive = item.status === 'active';

  return (
    <li className={cn('rounded-xl border border-border bg-card p-4', item.status === 'active' && 'border-l-2 border-l-destructive')}>
      <div className="flex gap-3">
        <span aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', meta.bgClass, meta.textClass)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h2 className="min-w-0 text-pretty wrap-anywhere text-sm font-semibold leading-5">{title}</h2>
            <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.bgClass, meta.textClass)}>
              {item.status === 'fixed' ? <Check aria-hidden="true" className="size-3" /> : <span aria-hidden="true" className={cn('size-1.5 rounded-full', meta.dotClass)} />}
              {meta.label}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {item.projectName ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderKanban aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{item.projectName}</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
              <time dateTime={item.resolvedAt ?? item.openedAt} title={exactTime(item.resolvedAt ?? item.openedAt)}>
                {when}
              </time>
            </span>
            {recurrence ? <span>{recurrence}</span> : null}
            {peak ? <span className="tabular-nums">{peak}</span> : null}
          </p>
          {item.body ? (
            <button
              type="button"
              onClick={() => setShowBody((value) => !value)}
              aria-expanded={showBody}
              className={cn(
                'block w-full cursor-pointer rounded-md bg-muted px-2.5 py-2 text-left font-mono text-xs leading-4 text-muted-foreground transition-colors wrap-anywhere hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring',
                showBody ? '' : 'line-clamp-2',
              )}
            >
              {item.body}
            </button>
          ) : null}
          {isActive ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p className="min-w-0 text-pretty text-sm text-foreground/80">{item.hint}</p>
              {item.action ? (
                <Link href={item.action.link} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full shrink-0 sm:w-auto')}>
                  {item.action.label}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              ) : null}
            </div>
          ) : null}
          {item.historyCount > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                aria-expanded={showHistory}
                className="inline-flex min-h-7 items-center gap-1 rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform motion-reduce:transition-none', showHistory && 'rotate-90')} />
                <History aria-hidden="true" className="size-3.5" />
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
    <ul className="mt-2 space-y-2 border-l border-border pl-4">
      {history.data.items.map((episode) => (
        <li key={episode.episodeId} className="relative text-xs leading-5 text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn('absolute -left-[1.3125rem] top-1.5 size-2 rounded-full ring-2 ring-card', episode.resolvedAt ? 'bg-emerald-500' : 'bg-destructive')}
          />
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
