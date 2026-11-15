'use client';

import { Fragment, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ColorMark } from '@/shared/ui/color-mark';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string | null;
  /** Description shown in the closed trigger; `null` hides it there. Defaults to `description`. */
  triggerDescription?: string | null;
  descriptionTone?: 'muted' | 'warning';
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
  searchable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  portalContainer?: HTMLElement | null;
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Выберите значение',
  searchPlaceholder = 'Поиск…',
  emptyLabel = 'Ничего не найдено',
  searchable = true,
  disabled = false,
  ariaLabel,
  className,
  portalContainer,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const selectedDescription = selected?.triggerDescription === undefined ? selected?.description : selected.triggerDescription;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    return term ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('ru-RU').includes(term)) : options;
  }, [options, search]);
  const activeOptionId = filtered[activeIndex] ? `${generatedId}-option-${activeIndex}` : undefined;

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setSearch('');
      setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    }
  }

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  function handleOptionKeys(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      // Resume tab order from the trigger instead of cycling through the portalled popup.
      event.stopPropagation();
      trigger.current?.focus({ preventScroll: true });
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' || (!searchable && event.key === ' ')) {
      event.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex].value);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!filtered.length) return;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(activeIndex + step, filtered.length - 1));
    setActiveIndex(nextIndex);
    list.current?.ownerDocument.getElementById(`${generatedId}-option-${nextIndex}`)?.scrollIntoView({ block: 'nearest' });
  }

  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger asChild>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          changeOpen(true);
        }}
        className={cn('flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-field px-3 py-1.5 text-left text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50', className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color ? <ColorMark color={selected.color} size="md" /> : null}
          {selected?.leading ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{selected.leading}</span> : null}
          {searchable && !selected?.leading && !selected?.color && selected ? <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{selected.label.slice(0, 1)}</span> : null}
          <span className="min-w-0"><span className={cn('block truncate', selected ? 'font-medium' : 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>{selectedDescription ? <span className={cn('block truncate text-[11px]', descriptionToneClass(selected?.descriptionTone))}>{selectedDescription}</span> : null}</span>
          {selected?.badge ? <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-300">{selected.badge}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform', open && 'rotate-180')} />
      </button>
    </PopoverTrigger>
    <PopoverContent
      portalContainer={portalContainer}
      align="start"
      side="bottom"
      sideOffset={5}
      collisionPadding={12}
      aria-labelledby={triggerId}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (searchable ? searchField.current : list.current)?.focus({ preventScroll: true });
        if (activeOptionId) list.current?.ownerDocument.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
      }}
      className={cn(
        'flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-content-available-width)] flex-col overflow-hidden rounded-xl p-0',
        searchable ? 'min-w-[min(16rem,var(--radix-popover-content-available-width))]' : 'min-w-[min(10rem,var(--radix-popover-content-available-width))]',
      )}
    >
      {searchable && <div className="shrink-0 border-b border-border p-2">
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchField}
            role="searchbox"
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }}
            onKeyDown={handleOptionKeys}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm focus:outline-2 focus:outline-ring/50"
          />
        </label>
      </div>}
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-labelledby={triggerId}
        aria-activedescendant={!searchable ? activeOptionId : undefined}
        tabIndex={!searchable ? -1 : undefined}
        onKeyDown={!searchable ? handleOptionKeys : undefined}
        className="min-h-0 max-h-64 overflow-y-auto overscroll-contain p-1.5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        {filtered.length ? filtered.map((option, index) => <Fragment key={option.value}>
          {option.group && option.group !== filtered[index - 1]?.group ? <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{option.group}</p> : null}
          <button
            id={`${generatedId}-option-${index}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(option.value)}
            className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left focus-visible:bg-muted motion-safe:transition-colors', index === activeIndex ? 'bg-muted' : 'hover:bg-muted/70')}
          >
            {option.leading ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{option.leading}</span> : option.color ? <ColorMark color={option.color} size="md" /> : searchable ? <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{option.label.slice(0, 1)}</span> : null}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{option.label}</span>{option.description ? <span className={cn('block truncate text-[11px]', descriptionToneClass(option.descriptionTone))}>{option.description}</span> : null}</span>
            {option.badge ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-300">{option.badge}</span> : null}
            {option.value === value ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> : null}
          </button>
        </Fragment>) : <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}

function descriptionToneClass(tone: SearchableSelectOption['descriptionTone']) {
  return tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground';
}
