import { AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import {
  formatSlaDueDate,
  getSlaState,
  slaStateLabel,
  type SlaState,
} from '@/shared/lib/sla';
import { cn } from '@/shared/lib/utils';

export function SlaIndicator({
  dueAt,
  assignedAt,
  showLabel = false,
  className,
}: {
  dueAt: string | null | undefined;
  assignedAt?: string | null;
  showLabel?: boolean;
  className?: string;
}) {
  if (!dueAt) {
    return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
  }

  const state = getSlaState(dueAt, assignedAt);
  const Icon = slaIcon(state);
  const label = slaStateLabel(state);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm',
        slaStateClass(state),
        className,
      )}
    >
      <Icon
        className={cn('h-3.5 w-3.5 shrink-0', state === 'overdue' && 'animate-pulse')}
        strokeWidth={1.75}
      />
      <span>{formatSlaDueDate(dueAt)}</span>
      {showLabel && label ? (
        <span className="rounded bg-current/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {label}
        </span>
      ) : null}
    </span>
  );
}

function slaIcon(state: SlaState) {
  switch (state) {
    case 'overdue':
      return AlertCircle;
    case 'critical':
      return AlertTriangle;
    default:
      return Clock;
  }
}

function slaStateClass(state: SlaState): string {
  switch (state) {
    case 'overdue':
      return 'font-medium text-red-600 dark:text-red-400';
    case 'critical':
      return 'text-orange-600 dark:text-orange-400';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    case 'ok':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

export function slaRowClass(dueAt: string | null | undefined, assignedAt?: string | null): string {
  const state = getSlaState(dueAt, assignedAt);
  if (state === 'overdue') {
    return 'bg-red-500/5 dark:bg-red-500/10';
  }
  if (state === 'critical') {
    return 'bg-orange-500/5 dark:bg-orange-500/10';
  }
  return '';
}
