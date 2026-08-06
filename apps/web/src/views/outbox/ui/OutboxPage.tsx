'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RequestStatus } from '@tracker/shared';
import { requestApi, type RequestListItem } from '@/entities/request/api/requestApi';
import {
  RequestPriorityBadge,
  priorityRowClass,
} from '@/entities/request/ui/RequestPriorityBadge';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { OutboxBulkBar } from './OutboxBulkBar';

type StatusFilter = 'all' | 'active' | 'draft' | 'done';

const ACTIVE_STATUSES: RequestStatus[] = ['submitted', 'in_progress', 'pending_info'];
const DONE_STATUSES: RequestStatus[] = ['approved', 'rejected', 'cancelled'];

const filterOptions: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'draft', label: 'Черновики' },
  { id: 'done', label: 'Завершённые' },
];

function matchesFilter(item: RequestListItem, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'draft') return item.status === 'draft';
  if (filter === 'active') return ACTIVE_STATUSES.includes(item.status);
  return DONE_STATUSES.includes(item.status);
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCompletedAt(value: string | null) {
  if (!value) return '—';
  return formatCreatedAt(value);
}

const DEFAULT_CONTAINER_SIZE = { width: undefined as number | undefined, height: undefined as number | undefined };

export function OutboxPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [containerSize, setContainerSize] = useState(DEFAULT_CONTAINER_SIZE);
  const [minSize, setMinSize] = useState<{ width?: number; height?: number }>({});
  const sectionRef = useRef<HTMLElement>(null);
  const minSizeLocked = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.outbox(),
    queryFn: () => requestApi.getOutbox(),
  });

  const items = useMemo(() => data?.data ?? [], [data]);

  const stats = useMemo(
    () => ({
      total: items.length,
      active: items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length,
      draft: items.filter((item) => item.status === 'draft').length,
      done: items.filter((item) => DONE_STATUSES.includes(item.status)).length,
    }),
    [items],
  );

  const filteredItems = useMemo(
    () => items.filter((item) => matchesFilter(item, statusFilter)),
    [items, statusFilter],
  );

  const filterCounts = useMemo(
    () => ({
      all: items.length,
      active: stats.active,
      draft: stats.draft,
      done: stats.done,
    }),
    [items.length, stats.active, stats.draft, stats.done],
  );

  // Drop selections that disappeared from the list (refetch, cancel, filter-independent)
  useEffect(() => {
    setSelectedIds((current) => {
      const alive = current.filter((id) => items.some((item) => item.id === id));
      return alive.length === current.length ? current : alive;
    });
  }, [items]);

  // Lock the resize minimum to the table's natural rendered size, so dragging can only grow it, never shrink below the default layout.
  useEffect(() => {
    if (minSizeLocked.current || !sectionRef.current || filteredItems.length === 0) return;
    minSizeLocked.current = true;
    const rect = sectionRef.current.getBoundingClientRect();
    setMinSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
  }, [filteredItems.length]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );

  const visibleSelectedCount = filteredItems.filter((item) =>
    selectedIds.includes(item.id),
  ).length;
  const allVisibleSelected =
    filteredItems.length > 0 && visibleSelectedCount === filteredItems.length;

  const toggleItem = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const toggleAllVisible = () =>
    setSelectedIds((current) => {
      const visibleIds = filteredItems.map((item) => item.id);
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });

  return (
    <DashboardShell
      title="Исходящие запросы"
      description="Запросы, созданные вами — в том числе одобренные, отклонённые и отменённые"
    >
      {isLoading && <TableSkeleton rows={5} />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && items.length === 0 && (
        <EmptyState
          icon={Send}
          title="Запросов пока нет"
          description="Создайте первый запрос — он появится здесь после сохранения черновика."
          action={
            <Link href={routes.newRequest}>
              <Button>
                <Plus className="h-4 w-4" />
                Создать запрос
              </Button>
            </Link>
          }
        />
      )}

      {data && items.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:divide-y-0 xl:grid-cols-4">
            <StatTile
              icon={FileText}
              label="Всего"
              value={stats.total}
              accent="text-primary"
              iconBg="bg-primary/10"
            />
            <StatTile
              icon={Clock}
              label="Активные"
              value={stats.active}
              accent="text-blue-600 dark:text-blue-300"
              iconBg="bg-blue-500/10"
            />
            <StatTile
              icon={Send}
              label="Черновики"
              value={stats.draft}
              accent="text-muted-foreground"
              iconBg="bg-muted"
            />
            <StatTile
              icon={CheckCircle2}
              label="Завершённые"
              value={stats.done}
              accent="text-green-600 dark:text-green-300"
              iconBg="bg-green-500/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:hidden">
            <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatusFilter(option.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  statusFilter === option.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {option.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                    statusFilter === option.id
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-background/80',
                  )}
                >
                  {filterCounts[option.id]}
                </span>
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center sm:hidden">
              <p className="text-sm font-medium">
                {statusFilter === 'done'
                  ? 'Нет завершённых запросов'
                  : 'Нет запросов в этой категории'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {statusFilter === 'done'
                  ? 'Одобренные, отклонённые и отменённые запросы появятся здесь.'
                  : 'Попробуйте другой фильтр или создайте новый запрос.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setStatusFilter('all')}
              >
                Показать все
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5 sm:hidden">
              {filteredItems.map((item) => (
                <Link
                  key={`${item.id}-card`}
                  href={routes.request(item.id)}
                  className={cn(
                    'block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-muted/40',
                    priorityRowClass(item.priority),
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.type.name} · {formatCreatedAt(item.createdAt)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <RequestStatusBadge status={item.status} />
                    <RequestPriorityBadge priority={item.priority} />
                  </div>
                </Link>
              ))}
            </div>
          )}

          <section
            ref={sectionRef}
            className="hidden resize flex-col overflow-auto rounded-xl border-2 border-border bg-card sm:flex"
            style={{
              width: containerSize.width,
              height: containerSize.height,
              minHeight: minSize.height,
              minWidth: minSize.width,
            }}
            onMouseUp={(event) => {
              const el = event.currentTarget as HTMLElement;
              setContainerSize({ width: el.offsetWidth, height: el.offsetHeight });
            }}
          >
            <div className="flex flex-col gap-4 border-b-2 border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Список запросов</h2>
                <p className="text-sm text-muted-foreground">
                  {stats.total}{' '}
                  {stats.total === 1 ? 'запрос' : stats.total < 5 ? 'запроса' : 'запросов'}
                  {statusFilter === 'done' ? ' · архив завершённых' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setContainerSize(DEFAULT_CONTAINER_SIZE)}
                  title="Сбросить размер таблицы"
                  className="hidden text-muted-foreground sm:inline-flex"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить размер
                </Button>
                <Link href={routes.newRequest}>
                  <Button className="w-full sm:w-auto">
                    <Plus className="h-4 w-4" />
                    Создать запрос
                  </Button>
                </Link>
              </div>
            </div>

            {selectedItems.length > 0 ? (
              <OutboxBulkBar selected={selectedItems} onClear={() => setSelectedIds([])} />
            ) : (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
              <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    statusFilter === option.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {option.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                      statusFilter === option.id
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-background/80',
                    )}
                  >
                    {filterCounts[option.id]}
                  </span>
                </button>
              ))}
            </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium">
                  {statusFilter === 'done'
                    ? 'Нет завершённых запросов'
                    : 'Нет запросов в этой категории'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {statusFilter === 'done'
                    ? 'Одобренные, отклонённые и отменённые запросы появятся здесь.'
                    : 'Попробуйте другой фильтр или создайте новый запрос.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setStatusFilter('all')}
                >
                  Показать все
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-y-2 border-border bg-muted/50 backdrop-blur supports-[backdrop-filter]:bg-muted/40 dark:bg-muted/20">
                      <th className="w-10 pl-6 pr-0 py-3.5">
                        <Checkbox
                          checked={allVisibleSelected}
                          indeterminate={visibleSelectedCount > 0 && !allVisibleSelected}
                          onCheckedChange={toggleAllVisible}
                          aria-label="Выбрать все запросы на странице"
                        />
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Запрос
                      </th>
                      <th className="hidden px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
                        Тип
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Статус
                      </th>
                      <th className="hidden px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                        Приоритет
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Создан
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Завершён
                      </th>
                      <th className="w-10 px-4 py-3.5" aria-hidden />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.map((item) => {
                      const isSelected = selectedIds.includes(item.id);
                      return (
                      <tr
                        key={item.id}
                        className={cn(
                          'group transition-colors hover:bg-muted/40 dark:hover:bg-accent/20',
                          priorityRowClass(item.priority),
                          isSelected && 'bg-primary/[0.06] hover:bg-primary/10 dark:bg-primary/10',
                        )}
                      >
                        <td className="w-10 pl-6 pr-0 py-3.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleItem(item.id)}
                            className={cn(
                              'transition-opacity',
                              !isSelected &&
                                'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                            )}
                            aria-label={`Выбрать «${item.title}»`}
                          />
                        </td>
                        <td className="truncate px-4 py-3.5">
                          <Link href={routes.request(item.id)} className="block min-w-0">
                            <span className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                              {item.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
                              {item.type.name}
                            </span>
                          </Link>
                        </td>
                        <td className="hidden truncate px-6 py-3.5 text-muted-foreground sm:table-cell">
                          {item.type.name}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <RequestStatusBadge status={item.status} />
                            <span className="md:hidden">
                              <RequestPriorityBadge priority={item.priority} />
                            </span>
                          </div>
                        </td>
                        <td className="hidden px-6 py-3.5 md:table-cell">
                          <RequestPriorityBadge priority={item.priority} />
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground tabular-nums">
                          {formatCreatedAt(item.createdAt)}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs tabular-nums">
                          {item.completedAt ? (
                            <span className="text-muted-foreground">
                              {formatCompletedAt(item.completedAt)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <Link
                            href={routes.request(item.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 hover:bg-accent hover:text-foreground"
                            aria-label={`Открыть «${item.title}»`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredItems.length > 0 && (
              <div className="border-t-2 border-border px-6 py-3 font-mono text-xs text-muted-foreground">
                Показано {filteredItems.length} из {items.length}
                {selectedItems.length > 0 && (
                  <span className="text-primary"> · выделено {selectedItems.length}</span>
                )}
                {statusFilter !== 'all' && (
                  <>
                    {' '}
                    · фильтр:{' '}
                    {filterOptions.find((option) => option.id === statusFilter)?.label.toLowerCase()}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
  iconBg,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  accent: string;
  iconBg: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', iconBg, accent)}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="font-mono text-2xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
