'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { NotificationBell } from '@/widgets/header/NotificationBell';

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
      <div className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
        <div className="min-w-0">
          {title ? (
            <TitleTag className="text-xl font-semibold tracking-tight">{title}</TitleTag>
          ) : null}
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground dark:text-foreground/68">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div data-tour="notifications-bell" className="flex items-center">
            <NotificationBell />
          </div>
          <Button variant="outline" size="sm" onClick={cycleTheme} aria-label="Переключить тему" className="shrink-0">
            <ThemeIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{themeLabel}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
