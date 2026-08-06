'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { notificationApi } from '@/entities/notification/api/notificationApi';
import { useNotificationStream } from '@/entities/notification/model/useNotificationStream';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

const PAGE_SIZE = 20;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.notifications.list(false, page),
    queryFn: () => notificationApi.list({ page, limit: PAGE_SIZE }),
  });

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  useNotificationStream(invalidate);

  const handleMarkRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    await notificationApi.markRead(id);
    invalidate();
  };

  const handleMarkAllRead = async () => {
    await notificationApi.markAllRead();
    invalidate();
  };

  return (
    <DashboardShell
      title="Уведомления"
      description="Назначения, решения и события по вашим запросам"
    >
      {data && data.unreadCount > 0 && (
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleMarkAllRead}>
            Отметить все прочитанными
          </Button>
        </div>
      )}

      {isLoading && <TableSkeleton rows={6} />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && items.length === 0 && (
        <EmptyState
          icon={Bell}
          title="Уведомлений пока нет"
          description="Когда по запросам появятся назначения, SLA или решения, они отобразятся здесь."
        />
      )}

      {data && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)] dark:shadow-none">
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const row = (
                <div
                  className={cn(
                    'flex items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/30',
                    !item.isRead && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      item.isRead ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-foreground">{item.title}</p>
                    {item.body && (
                      <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                    )}
                    <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={item.id}>
                  {item.requestId ? (
                    <Link
                      href={routes.request(item.requestId)}
                      onClick={() => handleMarkRead(item.id, item.isRead)}
                    >
                      {row}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => handleMarkRead(item.id, item.isRead)}
                    >
                      {row}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Всего {data.total} · страница {page} из {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Назад
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </DashboardShell>
  );
}
