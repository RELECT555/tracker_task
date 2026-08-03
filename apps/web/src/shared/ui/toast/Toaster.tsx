'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  dismissToast,
  getToasts,
  subscribeToToasts,
  type ToastItem,
  type ToastVariant,
} from './toast-store';

const EMPTY: ToastItem[] = [];

/**
 * Variants reuse the request-status tokens, so a success toast reads in exactly the
 * same colour language as the «Одобрен» badge and an error as «Отклонён».
 */
const variantStyles: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; plate: string; bar: string }
> = {
  success: {
    icon: CheckCircle2,
    plate:
      'border-[hsl(var(--status-approved-border))] bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]',
    bar: 'bg-[hsl(var(--status-approved-fg))]',
  },
  error: {
    icon: XCircle,
    plate:
      'border-[hsl(var(--status-rejected-border))] bg-[hsl(var(--status-rejected-bg))] text-[hsl(var(--status-rejected-fg))]',
    bar: 'bg-[hsl(var(--status-rejected-fg))]',
  },
  warning: {
    icon: AlertTriangle,
    plate:
      'border-[hsl(var(--status-pending-border))] bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]',
    bar: 'bg-[hsl(var(--status-pending-fg))]',
  },
  info: {
    icon: Info,
    plate:
      'border-[hsl(var(--status-progress-border))] bg-[hsl(var(--status-progress-bg))] text-[hsl(var(--status-progress-fg))]',
    bar: 'bg-[hsl(var(--status-progress-fg))]',
  },
};

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, () => EMPTY);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Уведомления"
      className="pointer-events-none fixed bottom-0 right-0 z-[60] flex w-full max-w-[24rem] flex-col gap-2 p-4 sm:p-6"
    >
      {toasts.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const { icon: Icon, plate, bar } = variantStyles[item.variant];
  const [paused, setPaused] = useState(false);
  // Remaining time survives hover pauses so a re-hover doesn't restart the timer
  const remainingRef = useRef(item.duration);
  const startedAtRef = useRef(Date.now());
  const timed = Number.isFinite(item.duration);

  useEffect(() => {
    if (paused || !Number.isFinite(remainingRef.current)) return;
    startedAtRef.current = Date.now();
    const timer = setTimeout(() => dismissToast(item.id), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current -= Date.now() - startedAtRef.current;
    };
  }, [paused, item.id]);

  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300',
        // Same floating surface as PopoverContent: depth comes from the popover
        // token in dark, from the shadow in light
        'group relative overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg dark:shadow-none',
      )}
    >
      <div className="flex gap-3 p-3">
        <span
          className={cn(
            'mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
            plate,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium leading-snug">{item.title}</p>

          {item.description && (
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}

          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick();
                dismissToast(item.id);
              }}
              className="mt-2 rounded-md text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {item.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => dismissToast(item.id)}
          aria-label="Закрыть уведомление"
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground',
            'opacity-0 transition-all hover:bg-accent hover:text-foreground',
            'group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {timed && (
        <span
          aria-hidden
          className={cn('toast-progress absolute inset-x-0 bottom-0 h-0.5 opacity-40', bar)}
          style={{
            animationDuration: `${item.duration}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      )}
    </div>
  );
}
