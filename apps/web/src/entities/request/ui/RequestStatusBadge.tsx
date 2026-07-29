import { cva } from 'class-variance-authority';
import { STATUS_LABELS, type RequestStatus } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      status: {
        draft:
          'border-[hsl(var(--status-draft-border))] bg-[hsl(var(--status-draft-bg))] text-[hsl(var(--status-draft-fg))]',
        submitted:
          'border-[hsl(var(--status-submitted-border))] bg-[hsl(var(--status-submitted-bg))] text-[hsl(var(--status-submitted-fg))]',
        in_progress:
          'border-[hsl(var(--status-progress-border))] bg-[hsl(var(--status-progress-bg))] text-[hsl(var(--status-progress-fg))]',
        pending_info:
          'border-[hsl(var(--status-pending-border))] bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]',
        approved:
          'border-[hsl(var(--status-approved-border))] bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]',
        rejected:
          'border-[hsl(var(--status-rejected-border))] bg-[hsl(var(--status-rejected-bg))] text-[hsl(var(--status-rejected-fg))]',
        cancelled:
          'border-[hsl(var(--status-cancelled-border))] bg-[hsl(var(--status-cancelled-bg))] text-[hsl(var(--status-cancelled-fg))]',
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
