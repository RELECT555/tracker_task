'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { notificationApi } from '@/entities/notification/api/notificationApi';
import { useNotificationStream } from '@/entities/notification/model/useNotificationStream';
import { routes } from '@/shared/config/routes';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

/** Safety net in case an SSE push is missed (reconnect gap, tab was asleep, etc). */
const FALLBACK_POLL_INTERVAL_MS = 90_000;

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.notifications.list(false, 1),
    queryFn: () => notificationApi.list({ limit: 6 }),
    refetchInterval: FALLBACK_POLL_INTERVAL_MS,
  });

  useNotificationStream(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleOpen = async (id: string, isRead: boolean) => {
    if (isRead) return;
    await notificationApi.markRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Уведомления"
          className="relative h-9 w-9 shrink-0 px-0"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">Уведомления</p>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `Непрочитанных: ${unreadCount}` : 'Пока пусто'}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium">Пока тихо</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Здесь появятся назначения, SLA и решения по запросам.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.map((item) => {
              const content = (
                <div
                  className={cn(
                    'flex gap-2 px-4 py-3 transition-colors hover:bg-muted/40',
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
                    <p className="truncate text-sm leading-snug text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatRelativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={item.id}>
                  {item.requestId ? (
                    <Link
                      href={routes.request(item.requestId)}
                      onClick={() => handleOpen(item.id, item.isRead)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => handleOpen(item.id, item.isRead)}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-border bg-muted/30 px-2 py-2 dark:bg-muted/15">
          <Link
            href={routes.notifications}
            className="flex h-9 items-center justify-center rounded-md text-sm font-medium text-primary transition-colors hover:bg-accent"
          >
            Все уведомления
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
