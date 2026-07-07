'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';

export function Header({ title, description }: { title: string; description?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const idx = order.indexOf((theme as (typeof order)[number]) ?? 'system');
    setTheme(order[(idx + 1) % order.length]);
  };

  const themeLabel =
    theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Системная';

  const ThemeIcon =
    !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-md">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={cycleTheme} aria-label="Переключить тему">
        <ThemeIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{themeLabel}</span>
      </Button>
    </header>
  );
}
