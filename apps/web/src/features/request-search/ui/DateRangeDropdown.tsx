'use client';

import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

function formatDay(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year.slice(2)}`;
}

function summarize(from: string, to: string): string | null {
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `с ${formatDay(from)}`;
  if (to) return `по ${formatDay(to)}`;
  return null;
}

export function DateRangeDropdown({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
}) {
  const summary = summarize(from, to);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          summary
            ? 'border-primary/40 bg-primary/10 font-medium text-primary'
            : 'border-input bg-field text-muted-foreground hover:bg-accent hover:text-foreground dark:border-border/70',
        )}
      >
        {summary ? (
          <>
            <span className="whitespace-nowrap font-mono text-xs tabular-nums">
              {summary}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Сбросить фильтр «${label}»`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange({ dateFrom: '', dateTo: '' });
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onChange({ dateFrom: '', dateTo: '' });
              }}
              className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded hover:bg-primary/20"
            >
              <X className="h-3 w-3" />
            </span>
          </>
        ) : (
          <>
            {label}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="search-date-from" className="text-xs">
            Не раньше
          </Label>
          <Input
            id="search-date-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => onChange({ dateFrom: event.target.value, dateTo: to })}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-date-to" className="text-xs">
            Не позже
          </Label>
          <Input
            id="search-date-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => onChange({ dateFrom: from, dateTo: event.target.value })}
            className="h-9"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
