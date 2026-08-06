'use client';

import { Menu, Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { HeaderSearch } from '@/widgets/header/HeaderSearch';
import { NotificationBell } from '@/widgets/header/NotificationBell';
import { useSidebarDrawer } from '@/widgets/dashboard-shell/sidebar-drawer-context';

export function Header({
  title,
  description,
  titleAs: TitleTag = 'h1',
}: {
  title: string;
  description?: string;
  titleAs?: 'h1' | 'p';
}) {
  const { theme, setTheme } = useTheme();
  const { setOpen } = useSidebarDrawer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const idx = order.indexOf((theme as (typeof order)[number]) ?? 'system');
    setTheme(order[(idx + 1) % order.length]);
  };

  const themeLabel = !mounted
    ? 'Системная'
    : theme === 'dark'
      ? 'Тёмная'
      : theme === 'light'
        ? 'Светлая'
        : 'Системная';

  const ThemeIcon =
    !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_-4px_hsl(var(--foreground)/0.06)] backdrop-blur-sm supports-[backdrop-filter]:bg-card/95 dark:border-border dark:shadow-[0_1px_0_0_hsl(var(--border)),0_8px_24px_-8px_hsl(0_0%_0%/0.55)]">
      <div className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2.5 sm:min-h-16 sm:gap-4 sm:px-4 sm:py-3 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
            className="-ml-1.5 shrink-0 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            {title ? (
              <TitleTag className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                {title}
              </TitleTag>
            ) : null}
            {description && (
              <p className="mt-0.5 hidden text-sm text-muted-foreground dark:text-foreground/68 sm:block">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <HeaderSearch />
          <div data-tour="notifications-bell" className="flex items-center">
            <NotificationBell />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={cycleTheme}
            aria-label="Переключить тему"
            className="hidden shrink-0 sm:inline-flex"
          >
            <ThemeIcon className="h-4 w-4" />
            <span className="hidden lg:inline">{themeLabel}</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={cycleTheme}
            aria-label="Переключить тему"
            className="shrink-0 sm:hidden"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
