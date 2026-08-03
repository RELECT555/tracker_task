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

const variantStyles: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; iconClass: string; accent: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'bg-green-500/10 text-green-600 dark:text-green-300',
    accent: 'bg-green-500',
  },
  error: {
    icon: XCircle,
    iconClass: 'bg-destructive/10 text-destructive',
    accent: 'bg-destructive',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    accent: 'bg-amber-500',
  },
  info: {
    icon: Info,
    iconClass: 'bg-primary/10 text-primary',
    accent: 'bg-primary',
  },
};

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, () => EMPTY);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Уведомления"
      className="pointer-events-none fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 sm:p-6"
    >
      {toasts.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const { icon: Icon, iconClass, accent } = variantStyles[item.variant];
  const [paused, setPaused] = useState(false);
  // Remaining time survives hover pauses so a re-hover doesn't restart the timer
  const remainingRef = useRef(item.duration);
  const startedAtRef = useRef(Date.now());

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
        'animate-in slide-in-from-bottom-2 fade-in duration-300 pointer-events-auto',
        'relative flex gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 pl-4 shadow-lg dark:shadow-black/40',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden />

      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          iconClass,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.description && (
          <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
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
            className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label="Закрыть уведомление"
        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
