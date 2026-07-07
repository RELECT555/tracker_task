import { cva } from 'class-variance-authority';
import { STATUS_LABELS, type RequestStatus } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      status: {
        draft: 'bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground',
        submitted: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
        in_progress: 'bg-indigo-50 text-indigo-700 dark:bg-primary/15 dark:text-primary',
        pending_info: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        approved: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
        rejected: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
        cancelled: 'bg-slate-100 text-slate-500 dark:bg-muted/80 dark:text-muted-foreground',
      },
    },
  },
);

export function RequestStatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  return (
    <span className={cn(badgeVariants({ status }), className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}
