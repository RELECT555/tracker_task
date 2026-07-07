import type { RouteSnapshot } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { RouteStepStatusBadge } from '@/entities/route/ui/RouteStepStatusBadge';

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
            'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
            step.status === 'active'
              ? 'border-primary/35 bg-primary/8 dark:border-primary/30 dark:bg-primary/10'
              : 'border-border bg-card/50',
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
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
            {step.dueAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                SLA: {new Date(step.dueAt).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
          <RouteStepStatusBadge status={step.status} />
        </li>
      ))}
    </ol>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 bg-muted/20 py-4 dark:bg-muted/10">
        <CardTitle className="text-base">Маршрут согласования</CardTitle>
      </CardHeader>
      <CardContent className="pt-5">{content}</CardContent>
    </Card>
  );
}
