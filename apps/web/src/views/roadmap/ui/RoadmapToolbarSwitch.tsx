'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface RoadmapToolbarSwitchProps {
  /** Accessible name and tooltip title (not shown inline); the full explanation lives in `hint`. */
  label: string;
  /** Shown on hover and focus, and announced as the switch description. */
  hint: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Compact labelled switch for the plan toolbar with a hover/focus explanation. */
export function RoadmapToolbarSwitch({ label, hint, icon, checked, onChange, disabled }: RoadmapToolbarSwitchProps) {
  const hintId = useId();
  return (
    <label
      className={cn(
        'group/switch relative inline-flex h-8 cursor-pointer items-center gap-2 px-2.5 text-xs font-medium text-foreground first:rounded-l-[5px] last:rounded-r-[5px] hover:bg-muted/60',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring',
        // Dim only the visible controls: `opacity` on the label would also fade the tooltip and trap its z-index.
        disabled && 'cursor-default text-muted-foreground hover:bg-transparent',
      )}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span aria-hidden="true" className="shrink-0 text-muted-foreground peer-disabled:opacity-50 [&>svg]:size-3.5">{icon}</span>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full bg-muted ring-1 ring-inset ring-border after:absolute after:left-0.5 after:top-0.5 after:size-3 after:rounded-full after:bg-muted-foreground after:content-['']",
          'peer-disabled:opacity-50 peer-checked:bg-primary peer-checked:ring-primary peer-checked:after:translate-x-3 peer-checked:after:bg-primary-foreground',
          'dark:ring-muted-foreground/50 forced-colors:outline forced-colors:outline-[ButtonText] forced-colors:after:bg-[ButtonText]',
        )}
      />
      <span
        id={hintId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-0 top-full z-30 mt-1.5 w-64 rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 text-popover-foreground shadow-md',
          'invisible opacity-0 transition-opacity duration-150 group-hover/switch:visible group-hover/switch:opacity-100 group-has-[:focus-visible]/switch:visible group-has-[:focus-visible]/switch:opacity-100',
        )}
      >
        <span className="mb-0.5 block font-medium">{label}</span>
        {hint}
      </span>
    </label>
  );
}
