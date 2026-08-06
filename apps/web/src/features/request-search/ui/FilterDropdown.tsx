'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Compact multi-select filter. Collapses a long option list into a trigger that
 * summarises the current selection, so the bar stays readable as options grow.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const active = selected.length > 0;
  const firstLabel = options.find((option) => option.value === selected[0])?.label;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          active
            ? 'border-primary/40 bg-primary/10 font-medium text-primary'
            : 'border-input bg-field text-muted-foreground hover:bg-accent hover:text-foreground dark:border-border/70',
        )}
      >
        {active && firstLabel ? (
          <>
            <span className="max-w-32 truncate">{firstLabel}</span>
            {selected.length > 1 && (
              <span className="rounded bg-primary/20 px-1 font-mono text-[10px] tabular-nums">
                +{selected.length - 1}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Сбросить фильтр «${label}»`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onClear();
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

      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-72 overflow-y-auto">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggle(option.value)}
                aria-pressed={checked}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
