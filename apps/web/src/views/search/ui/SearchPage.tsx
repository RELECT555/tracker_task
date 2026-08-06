'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownWideNarrow, ChevronRight, RotateCcw, Search, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRIORITY_LABELS,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  STATUS_LABELS,
  type RequestPriority,
  type RequestStatus,
} from '@tracker/shared';
import { requestApi } from '@/entities/request/api/requestApi';
import {
  RequestPriorityBadge,
  priorityRowClass,
} from '@/entities/request/ui/RequestPriorityBadge';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { requestTypeApi } from '@/entities/request-type/api/requestTypeApi';
import {
  countActiveFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  parseSearchFilters,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  serializeSearchFilters,
  toggleInList,
  type SearchFilters,
} from '@/features/request-search/model/search-params';
import { DateRangeDropdown } from '@/features/request-search/ui/DateRangeDropdown';
import { FilterDropdown } from '@/features/request-search/ui/FilterDropdown';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlFilters = useMemo(
    () => parseSearchFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // The text box stays local so typing does not push a history entry per keystroke.
  const [queryText, setQueryText] = useState(urlFilters.q);
  const debouncedQuery = useDebouncedValue(queryText, 300);

  useEffect(() => setQueryText(urlFilters.q), [urlFilters.q]);

  const applyFilters = useCallback(
    (next: SearchFilters) => {
      const query = serializeSearchFilters(next);
      router.replace(query ? `${routes.search}?${query}` : routes.search, {
        scroll: false,
      });
    },
    [router],
  );

  useEffect(() => {
    if (debouncedQuery === urlFilters.q) return;
    applyFilters({ ...urlFilters, q: debouncedQuery, page: 1 });
  }, [debouncedQuery, urlFilters, applyFilters]);

  /** Any filter change resets to the first page — page 3 of the old result set is meaningless. */
  const patchFilters = (patch: Partial<SearchFilters>) =>
    applyFilters({ ...urlFilters, ...patch, page: 1 });

  const typesQuery = useQuery({
    queryKey: queryKeys.requestTypes.all,
    queryFn: () => requestTypeApi.list(),
  });

  const searchEnabled = hasActiveFilters(urlFilters);
  const apiParams = {
    q: urlFilters.q.trim() || undefined,
    status: urlFilters.statuses,
    priority: urlFilters.priorities,
    typeId: urlFilters.typeId || undefined,
    dateFrom: urlFilters.dateFrom || undefined,
    dateTo: urlFilters.dateTo || undefined,
    sort: urlFilters.sort,
    page: urlFilters.page,
    limit: SEARCH_PAGE_SIZE,
  };

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.requests.search(apiParams),
    queryFn: () => requestApi.search(apiParams),
    enabled: searchEnabled,
    placeholderData: (previous) => previous,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const activeFilterCount = countActiveFilters(urlFilters);
  const typeItems = typesQuery.data?.data ?? [];

  return (
    <DashboardShell
      title="Поиск запросов"
      description="Ищите среди созданных вами запросов и тех, где вы были согласующим"
    >
      <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
              />
              <Input
                autoFocus
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Название запроса — минимум 2 символа"
                aria-label="Поисковый запрос"
                className="h-11 pl-9 pr-9"
              />
              {queryText && (
                <button
                  type="button"
                  onClick={() => setQueryText('')}
                  aria-label="Очистить запрос"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 p-3">
            <FilterDropdown
              label="Статус"
              options={REQUEST_STATUSES.map((status) => ({
                value: status,
                label: STATUS_LABELS[status],
              }))}
              selected={urlFilters.statuses}
              onToggle={(value) =>
                patchFilters({
                  statuses: toggleInList(urlFilters.statuses, value as RequestStatus),
                })
              }
              onClear={() => patchFilters({ statuses: [] })}
            />

            <FilterDropdown
              label="Приоритет"
              options={REQUEST_PRIORITIES.map((priority) => ({
                value: priority,
                label: PRIORITY_LABELS[priority],
              }))}
              selected={urlFilters.priorities}
              onToggle={(value) =>
                patchFilters({
                  priorities: toggleInList(
                    urlFilters.priorities,
                    value as RequestPriority,
                  ),
                })
              }
              onClear={() => patchFilters({ priorities: [] })}
            />

            {typeItems.length > 0 && (
              <FilterDropdown
                label="Тип"
                options={typeItems.map((type) => ({ value: type.id, label: type.name }))}
                selected={urlFilters.typeId ? [urlFilters.typeId] : []}
                onToggle={(value) =>
                  patchFilters({ typeId: urlFilters.typeId === value ? '' : value })
                }
                onClear={() => patchFilters({ typeId: '' })}
              />
            )}

            <DateRangeDropdown
              label="Период"
              from={urlFilters.dateFrom}
              to={urlFilters.dateTo}
              onChange={(next) => patchFilters(next)}
            />

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  patchFilters({ sort: urlFilters.sort === 'recent' ? 'oldest' : 'recent' })
                }
                title="Переключить порядок сортировки"
              >
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                {urlFilters.sort === 'recent' ? 'Сначала новые' : 'Сначала старые'}
              </Button>

              {(activeFilterCount > 0 || queryText) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQueryText('');
                    applyFilters(EMPTY_FILTERS);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </Button>
              )}
            </div>
          </div>
        </section>

        {!searchEnabled && (
          <EmptyState
            icon={Search}
            title="Задайте условия поиска"
            description={`Введите минимум ${SEARCH_MIN_QUERY_LENGTH} символа в строке поиска или выберите фильтр выше.`}
          />
        )}

        {searchEnabled && error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {searchEnabled && isLoading && <TableSkeleton rows={5} />}

        {searchEnabled && data && items.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="Ничего не найдено"
            description="Попробуйте изменить формулировку или снять часть фильтров."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQueryText('');
                  applyFilters(EMPTY_FILTERS);
                }}
              >
                Сбросить фильтры
              </Button>
            }
          />
        )}

        {searchEnabled && data && items.length > 0 && (
          <section
            className={cn(
              'overflow-hidden rounded-xl border border-border bg-card transition-opacity',
              isFetching && 'opacity-60',
            )}
          >
            <div className="border-b border-border px-6 py-3 text-sm text-muted-foreground">
              Найдено <span className="font-medium text-foreground">{total}</span>
              {totalPages > 1 && (
                <> · страница {urlFilters.page} из {totalPages}</>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 dark:bg-muted/15">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Запрос
                    </th>
                    <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                      Тип
                    </th>
                    <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell">
                      Автор
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Статус
                    </th>
                    <th className="hidden px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                      Приоритет
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Создан
                    </th>
                    <th className="w-10 px-4 py-3" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'group transition-colors hover:bg-muted/30 dark:hover:bg-accent/20',
                        priorityRowClass(item.priority),
                      )}
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
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                        {item.author.fullName}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <RequestStatusBadge status={item.status} />
                          <span className="md:hidden">
                            <RequestPriorityBadge priority={item.priority} />
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-6 py-4 md:table-cell">
                        <RequestPriorityBadge priority={item.priority} />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={routes.request(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {(urlFilters.page - 1) * SEARCH_PAGE_SIZE + 1}–
                  {Math.min(urlFilters.page * SEARCH_PAGE_SIZE, total)} из {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={urlFilters.page <= 1}
                    onClick={() =>
                      applyFilters({ ...urlFilters, page: urlFilters.page - 1 })
                    }
                  >
                    Назад
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={urlFilters.page >= totalPages}
                    onClick={() =>
                      applyFilters({ ...urlFilters, page: urlFilters.page + 1 })
                    }
                  >
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
