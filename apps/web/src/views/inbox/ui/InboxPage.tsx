'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Archive, ArrowUpDown, Filter, Inbox } from 'lucide-react';
import { useState } from 'react';
import { requestApi } from '@/entities/request/api/requestApi';
import {
  RequestPriorityBadge,
  priorityRowClass,
} from '@/entities/request/ui/RequestPriorityBadge';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { SlaIndicator, slaRowClass } from '@/entities/request/ui/SlaIndicator';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

type InboxScope = 'active' | 'archive';
type InboxSort = 'sla' | 'recent';

const scopeOptions: { id: InboxScope; label: string }[] = [
  { id: 'active', label: 'Активные' },
  { id: 'archive', label: 'Архив' },
];

function formatProcessedAt(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function InboxPage() {
  const [scope, setScope] = useState<InboxScope>('active');
  const [sort, setSort] = useState<InboxSort>('sla');

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.inbox(scope, sort),
    queryFn: () => requestApi.getInbox({ scope, sort: scope === 'active' ? sort : 'recent' }),
  });

  const items = data?.data ?? [];
  const isArchive = scope === 'archive';

  return (
    <DashboardShell
      title="Входящие запросы"
      description={
        isArchive
          ? 'Запросы, которые вы уже обработали'
          : 'Запросы, назначенные на вас'
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
          {scopeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setScope(option.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                scope === option.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {!isArchive && (
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sort} onValueChange={(value) => setSort(value as InboxSort)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sla">По SLA</SelectItem>
                <SelectItem value="recent">Сначала новые</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading && <TableSkeleton rows={6} />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && items.length === 0 && (
        <EmptyState
          icon={isArchive ? Archive : Inbox}
          title={isArchive ? 'Архив пуст' : 'Inbox пуст'}
          description={
            isArchive
              ? 'Пока нет обработанных запросов. Они появятся здесь после согласования или отклонения.'
              : 'Здесь появятся запросы, назначенные на вас после отправки черновиков на согласование.'
          }
        />
      )}

      {data && items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 dark:bg-muted/25">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Название
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Автор
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Шаг
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Статус
                  </th>
                  <th className="hidden px-5 py-3.5 text-left font-medium text-muted-foreground md:table-cell">
                    Приоритет
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    {isArchive ? 'Обработан' : 'SLA'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr
                    key={`${item.id}-${item.currentStep.assignedAt}`}
                    className={cn(
                      'transition-colors hover:bg-muted/40 dark:hover:bg-accent/25',
                      priorityRowClass(item.priority),
                      !isArchive &&
                        slaRowClass(item.currentStep.dueAt, item.currentStep.assignedAt),
                    )}
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={routes.request(item.id)}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{item.type.name}</p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{item.author.fullName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{item.currentStep.name}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RequestStatusBadge status={item.status} />
                        <span className="md:hidden">
                          <RequestPriorityBadge priority={item.priority} />
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 md:table-cell">
                      <RequestPriorityBadge priority={item.priority} />
                    </td>
                    <td className="px-5 py-4">
                      {isArchive ? (
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {item.completedAt ? formatProcessedAt(item.completedAt) : '—'}
                        </span>
                      ) : (
                        <SlaIndicator
                          dueAt={item.currentStep.dueAt}
                          assignedAt={item.currentStep.assignedAt}
                          showLabel
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </DashboardShell>
  );
}
