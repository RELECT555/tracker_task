'use client';

import { Check, Minus } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

export interface CheckboxProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, indeterminate = false, onCheckedChange, ...props }, ref) => {
    const active = checked || indeterminate;

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        onClick={(event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) onCheckedChange?.(!checked);
        }}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-40 active:scale-90',
          active
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-input bg-field hover:border-primary/60 hover:bg-primary/5',
          className,
        )}
        {...props}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3" strokeWidth={3} />
        ) : checked ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : null}
      </button>
    );
  },
);
Checkbox.displayName = 'Checkbox';
