'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function Header({ title }: { title: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const idx = order.indexOf((theme as (typeof order)[number]) ?? 'system');
    setTheme(order[(idx + 1) % order.length]);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <button
        type="button"
        onClick={cycleTheme}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Переключить тему"
      >
        {!mounted ? (
          <Monitor className="h-4 w-4" />
        ) : theme === 'dark' ? (
          <Moon className="h-4 w-4" />
        ) : theme === 'light' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Monitor className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">
          {theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Системная'}
        </span>
      </button>
    </header>
  );
}
