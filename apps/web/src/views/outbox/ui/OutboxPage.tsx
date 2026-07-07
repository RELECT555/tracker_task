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
  Send,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RequestStatus } from '@tracker/shared';
import { requestApi, type RequestListItem } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

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

export function OutboxPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.outbox(),
    queryFn: () => requestApi.getOutbox(),
  });

  const items = data?.data ?? [];

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

  return (
    <DashboardShell
      title="Исходящие запросы"
      description="Запросы, созданные вами"
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={FileText}
              label="Всего"
              value={stats.total}
              accent="text-primary bg-primary/10"
            />
            <StatCard
              icon={Clock}
              label="Активные"
              value={stats.active}
              accent="text-blue-600 bg-blue-500/10 dark:text-blue-300"
            />
            <StatCard
              icon={Send}
              label="Черновики"
              value={stats.draft}
              accent="text-muted-foreground bg-muted"
            />
            <StatCard
              icon={CheckCircle2}
              label="Завершённые"
              value={stats.done}
              accent="text-green-600 bg-green-500/10 dark:text-green-300"
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-border/60 bg-muted/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between dark:bg-muted/15">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Send className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Список запросов</h2>
                  <p className="text-sm text-muted-foreground">
                    {stats.total}{' '}
                    {stats.total === 1 ? 'запрос' : stats.total < 5 ? 'запроса' : 'запросов'}
                  </p>
                </div>
              </div>
              <Link href={routes.newRequest}>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Создать запрос
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3">
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
                      'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
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
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium">Нет запросов в этой категории</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Попробуйте другой фильтр или создайте новый запрос.
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
                    <tr className="border-b border-border/60 bg-muted/20 dark:bg-muted/10">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Запрос
                      </th>
                      <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                        Тип
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Статус
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Создан
                      </th>
                      <th className="w-10 px-4 py-3" aria-hidden />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        className="group transition-colors hover:bg-muted/30 dark:hover:bg-accent/20"
                      >
                        <td className="px-6 py-4">
                          <Link href={routes.request(item.id)} className="block min-w-0">
                            <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                              {item.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                              {item.type.name}
                            </span>
                          </Link>
                        </td>
                        <td className="hidden px-6 py-4 text-muted-foreground sm:table-cell">
                          {item.type.name}
                        </td>
                        <td className="px-6 py-4">
                          <RequestStatusBadge status={item.status} />
                        </td>
                        <td className="px-6 py-4 text-muted-foreground tabular-nums">
                          {formatCreatedAt(item.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={routes.request(item.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-accent hover:text-foreground"
                            aria-label={`Открыть «${item.title}»`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredItems.length > 0 && (
              <div className="border-t border-border/60 bg-muted/20 px-6 py-3 text-xs text-muted-foreground dark:bg-muted/10">
                Показано {filteredItems.length} из {items.length}
                {statusFilter !== 'all' && (
                  <>
                    {' '}
                    · фильтр:{' '}
                    {filterOptions.find((option) => option.id === statusFilter)?.label.toLowerCase()}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent)}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
