import { cva } from 'class-variance-authority';
import { STATUS_LABELS, type RequestStatus } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      status: {
        draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        submitted: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        in_progress: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
        pending_info: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        approved: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
        rejected: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
        cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
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
