import type { RouteStepStatus } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';

const STEP_STATUS_LABELS: Record<RouteStepStatus, string> = {
  pending: 'Ожидает',
  active: 'В работе',
  completed: 'Завершён',
  skipped: 'Пропущен',
};

const STEP_STATUS_STYLES: Record<RouteStepStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  active: 'bg-primary/15 text-primary',
  completed: 'bg-green-500/15 text-green-600 dark:text-green-300',
  skipped: 'bg-muted/80 text-muted-foreground',
};

export function RouteStepStatusBadge({ status }: { status: RouteStepStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
        STEP_STATUS_STYLES[status],
      )}
    >
      {STEP_STATUS_LABELS[status]}
    </span>
  );
}
