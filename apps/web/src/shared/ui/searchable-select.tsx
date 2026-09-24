'use client';

import { useId, useMemo, useState } from 'react';
import { Fragment, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string | null;
  color?: string;
  badge?: string;
  group?: string;
  leading?: ReactNode;
}

export interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Выберите значение',
  searchPlaceholder = 'Поиск…',
  emptyLabel = 'Ничего не найдено',
  disabled = false,
  ariaLabel,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    return options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('ru-RU').includes(term));
  }, [options, search]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setSearch('');
    setActiveIndex(0);
  };

  return <Popover open={open} onOpenChange={(nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) { setSearch(''); setActiveIndex(0); }
  }}>
    <PopoverTrigger asChild>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        className={cn('flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-field px-3 py-1.5 text-left text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50', className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} /> : null}
          {selected?.leading ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{selected.leading}</span> : null}
          {!selected?.leading && !selected?.color && selected ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{selected.label.slice(0, 1)}</span> : null}
          <span className="min-w-0"><span className={cn('block truncate', selected ? 'font-medium' : 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>{selected?.description ? <span className="block truncate text-[10px] text-muted-foreground">{selected.description}</span> : null}</span>
          {selected?.badge ? <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-300">{selected.badge}</span> : null}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" sideOffset={5} collisionPadding={12} className="w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-xl p-0">
      <div className="border-b border-border p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            role="searchbox"
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={filtered[activeIndex] ? `${generatedId}-option-${activeIndex}` : undefined}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
              if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex].value); }
            }}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"
          />
        </label>
      </div>
      <div id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
        {filtered.length ? filtered.map((option, index) => <Fragment key={option.value}>
          {option.group && option.group !== filtered[index - 1]?.group ? <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{option.group}</p> : null}
          <button
            id={`${generatedId}-option-${index}`}
            type="button"
            role="option"
            aria-selected={option.value === value}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(option.value)}
            className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', index === activeIndex ? 'bg-muted' : 'hover:bg-muted/70')}
          >
            {option.leading ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{option.leading}</span> : option.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{option.label.slice(0, 1)}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{option.label}</span>{option.description ? <span className="block truncate text-[10px] text-muted-foreground">{option.description}</span> : null}</span>
            {option.badge ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-300">{option.badge}</span> : null}
            {option.value === value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
          </button>
        </Fragment>) : <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
