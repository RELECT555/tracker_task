import { History } from 'lucide-react';
import { STATUS_LABELS, TRANSITION_ACTION_LABELS, type RequestStatus } from '@tracker/shared';
import type { RequestTransition } from '@/entities/request/api/requestApi';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export function RequestHistoryTimeline({
  transitions,
  embedded = false,
}: {
  transitions: RequestTransition[];
  embedded?: boolean;
}) {
  if (transitions.length === 0) {
    return null;
  }

  const content = (
    <div className="rounded-lg border border-border bg-muted px-4 py-3 dark:bg-muted/10">
      <ol className="relative space-y-0">
      {transitions.map((item, index) => {
        const isLast = index === transitions.length - 1;

        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-border/80"
              />
            ) : null}
            <span
              className={cn(
                'relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                actionDotClass(item.action),
              )}
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium leading-snug">
                {TRANSITION_ACTION_LABELS[item.action] ?? item.action}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatStatusChange(item.fromStatus, item.toStatus, item.fromStep, item.toStep)}
              </p>
              {item.actor ? (
                <p className="text-xs text-muted-foreground">{item.actor.fullName}</p>
              ) : null}
              {item.comment ? (
                <p className="mt-1.5 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                  {item.comment}
                </p>
              ) : null}
              <time
                dateTime={item.createdAt}
                className="block pt-0.5 font-mono text-xs text-muted-foreground tabular-nums"
              >
                {new Date(item.createdAt).toLocaleString('ru-RU')}
              </time>
            </div>
          </li>
        );
      })}
      </ol>
    </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 bg-muted/20 py-4 dark:bg-muted/10">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          История изменений
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">{content}</CardContent>
    </Card>
  );
}

function formatStatusChange(
  fromStatus: RequestStatus | null,
  toStatus: RequestStatus,
  fromStep: number | null,
  toStep: number | null,
): string {
  const fromLabel = fromStatus ? STATUS_LABELS[fromStatus] : null;
  const toLabel = STATUS_LABELS[toStatus];

  if (fromStatus && fromStatus !== toStatus && fromLabel) {
    return `${fromLabel} → ${toLabel}`;
  }

  if (
    fromStep !== null &&
    toStep !== null &&
    fromStep !== toStep &&
    fromStatus === toStatus
  ) {
    return `${toLabel}, шаг ${fromStep + 1} → ${toStep + 1}`;
  }

  return toLabel;
}

function actionDotClass(action: string): string {
  switch (action) {
    case 'approve':
    case 'provide_info':
      return 'border-green-500/60 bg-green-500/10';
    case 'reject':
    case 'cancel':
      return 'border-destructive/60 bg-destructive/10';
    case 'request_info':
    case 'escalate':
    case 'sla_escalate':
      return 'border-amber-500/60 bg-amber-500/10';
    default:
      return 'border-primary/60 bg-primary/10';
  }
}
