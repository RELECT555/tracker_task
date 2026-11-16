'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import type { RoadmapNotificationDto } from '@tracker/shared';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { ErrorNotice, QueryErrorNotice } from '@/shared/ui/error-notice';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { badgeOf, currentLabel, relativeTime, statusLabel } from './notification-view';

const SUMMARY_KEY = ['roadmap', 'notifications', 'summary'] as const;
const LIST_KEY = ['roadmap', 'notifications', 'list'] as const;
const SUMMARY_POLL_MS = 60_000;

/** Header bell: unread sync-health problems and a popover list of them. */
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const summary = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: roadmapApi.notificationSummary,
    refetchInterval: SUMMARY_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const list = useInfiniteQuery({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => roadmapApi.notifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open,
  });

  // Fire and forget: returning the invalidation promise from onSettled would hold the mutation
  // (and the navigation that awaits it) until the summary and list refetches finish.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  };
  const markRead = useMutation({ mutationFn: roadmapApi.markNotificationRead, onSettled: refresh });
  const markAllRead = useMutation({ mutationFn: roadmapApi.markAllNotificationsRead, onSettled: refresh });

  const badge = badgeOf(summary.data);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  async function openItem(item: RoadmapNotificationDto) {
    if (!item.readAt) {
      try {
        await markRead.mutateAsync(item.id);
      } catch {
        // Following the link matters more than the read flag; the list refreshes and shows the item as unread.
      }
    }
    setOpen(false);
    router.push(item.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Уведомления"
          title="Уведомления"
          className="relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Bell aria-hidden="true" className="size-4" />
          {badge?.kind === 'count' ? (
            <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none tabular-nums text-white">
              {badge.label}
            </span>
          ) : null}
          {badge?.kind === 'dot' ? (
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-muted-foreground ring-2 ring-card" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Уведомления</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            disabled={!summary.data?.unread || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <Check aria-hidden="true" className="size-3.5" />
            Прочитать все
          </Button>
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {markAllRead.error ? (
            <ErrorNotice title="Не удалось отметить уведомления" errors={[markAllRead.error]} className="m-3" />
          ) : null}
          {list.isPending && !list.error ? (
            <SkeletonStatus label="Загружаем уведомления" className="space-y-3 p-4">
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </SkeletonStatus>
          ) : list.error && !items.length ? (
            <QueryErrorNotice title="Не удалось загрузить уведомления" queries={[list]} className="m-3" />
          ) : !items.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Всё спокойно — проблем с синхронизацией нет</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => <NotificationRow key={item.id} item={item} onOpen={() => void openItem(item)} />)}
            </ul>
          )}
          {list.error && items.length ? (
            <QueryErrorNotice title="Не удалось загрузить уведомления" queries={[list]} className="m-3" />
          ) : null}
          {list.hasNextPage ? (
            <div className="border-t border-border p-2 text-center">
              <Button type="button" variant="ghost" size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {list.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ item, onOpen }: { item: RoadmapNotificationDto; onOpen: () => void }) {
  const unread = !item.readAt;
  const status = statusLabel(item);
  const current = currentLabel(item);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
        <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className={cn('block text-pretty wrap-anywhere text-sm leading-5', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {unread ? <span className="sr-only">Не прочитано: </span> : null}
            {item.title}
          </span>
          {item.body ? <span className="block text-pretty wrap-anywhere text-xs leading-4 text-muted-foreground">{item.body}</span> : null}
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{[item.projectName, relativeTime(item.createdAt)].filter(Boolean).join(' · ')}</span>
            {status ? (
              <span className="inline-flex items-center gap-1">
                {item.resolution === 'fixed' ? <Check aria-hidden="true" className="size-3" /> : null}
                {status}
              </span>
            ) : current ? <span className="tabular-nums">{current}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}
