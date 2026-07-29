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
    <ol className="relative">
      {transitions.map((item, index) => {
        const isLast = index === transitions.length - 1;
        const statusChange = formatStatusChange(
          item.fromStatus,
          item.toStatus,
          item.fromStep,
          item.toStep,
        );
        const metaParts = [statusChange, item.actor?.fullName].filter(Boolean) as string[];

        return (
          <li key={item.id} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-border"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-background',
                actionDotClass(item.action),
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">
                {TRANSITION_ACTION_LABELS[item.action] ?? item.action}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {metaParts.map((part, i) => (
                  <span key={`${item.id}-meta-${i}`}>
                    {i > 0 ? <span className="mx-1.5 text-border">·</span> : null}
                    {part}
                  </span>
                ))}
                {metaParts.length > 0 ? <span className="mx-1.5 text-border">·</span> : null}
                <time dateTime={item.createdAt} className="font-mono tabular-nums">
                  {new Date(item.createdAt).toLocaleString('ru-RU')}
                </time>
              </p>
              {item.comment ? (
                <p className="mt-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-2 text-sm leading-relaxed text-foreground dark:bg-muted/25">
                  {item.comment}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
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
      return 'bg-green-500/70';
    case 'reject':
    case 'cancel':
      return 'bg-destructive/70';
    case 'request_info':
    case 'escalate':
    case 'sla_escalate':
      return 'bg-amber-500/70';
    default:
      return 'bg-primary/70';
  }
}
