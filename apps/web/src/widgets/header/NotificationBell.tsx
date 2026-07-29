'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export function NotificationBell() {
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
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">Уведомления</p>
          <p className="text-xs text-muted-foreground">Пока пусто</p>
        </div>

        <div className="px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Bell className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium">Пока тихо</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Здесь появятся назначения, SLA и решения по запросам.
          </p>
        </div>

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
