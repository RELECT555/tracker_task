import { cva } from 'class-variance-authority';
import { PRIORITY_LABELS, type RequestPriority } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      priority: {
        low: 'text-slate-500 dark:text-slate-400',
        normal: 'text-muted-foreground',
        high: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        urgent: 'bg-red-50 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300',
      },
    },
  },
);

const dotVariants = cva('h-1.5 w-1.5 shrink-0 rounded-full', {
  variants: {
    priority: {
      low: 'bg-slate-400',
      normal: 'bg-muted-foreground/50',
      high: 'bg-amber-500',
      urgent: 'bg-red-500',
    },
  },
});

/**
 * List/inbox badge. `normal` is hidden per design system.
 * Pass `alwaysShow` on detail surfaces where the value must be explicit.
 */
export function RequestPriorityBadge({
  priority,
  alwaysShow = false,
  className,
}: {
  priority: RequestPriority;
  alwaysShow?: boolean;
  className?: string;
}) {
  if (priority === 'normal' && !alwaysShow) {
    return null;
  }

  return (
    <span className={cn(badgeVariants({ priority }), className)}>
      <span className={dotVariants({ priority })} aria-hidden />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/** Bold the whole row for urgent items (inbox / outbox tables). */
export function priorityRowClass(priority: RequestPriority): string | undefined {
  return priority === 'urgent' ? 'font-semibold' : undefined;
}
