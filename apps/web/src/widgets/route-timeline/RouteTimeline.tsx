import type { RouteSnapshot } from '@tracker/shared';
import { SlaIndicator } from '@/entities/request/ui/SlaIndicator';
import { RouteStepStatusBadge } from '@/entities/route/ui/RouteStepStatusBadge';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export function RouteTimeline({
  route,
  embedded = false,
}: {
  route: RouteSnapshot;
  embedded?: boolean;
}) {
  const content = (
    <ol className="space-y-2">
      {route.steps.map((step) => (
        <li
          key={step.index}
          className={cn(
            'flex items-start gap-3 py-2.5',
            step.status === 'active'
              ? 'border-l-2 border-primary pl-3'
              : 'border-l-2 border-transparent pl-3',
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium',
              step.status === 'active'
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {step.index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{step.name}</p>
            <p className="text-xs text-muted-foreground">{step.assignee.fullName}</p>
            {step.status === 'active' && step.dueAt ? (
              <div className="mt-1">
                <SlaIndicator dueAt={step.dueAt} className="text-xs" />
              </div>
            ) : null}
          </div>
          <RouteStepStatusBadge status={step.status} />
        </li>
      ))}
    </ol>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border border-border bg-muted px-3 py-2 dark:bg-muted/10">
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 bg-muted/20 py-4 dark:bg-muted/10">
        <CardTitle className="text-base">Маршрут согласования</CardTitle>
      </CardHeader>
      <CardContent className="pt-5">{content}</CardContent>
    </Card>
  );
}
