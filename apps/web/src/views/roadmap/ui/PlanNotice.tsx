import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const tones = {
  info: { icon: Info, className: 'bg-primary/10 text-primary' },
  warning: { icon: AlertTriangle, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
} as const;

/**
 * Page-level status message above the plan. Matches `ErrorNotice` so every notice
 * shares one shape and only the tone (icon and tint) tells them apart.
 */
export function PlanNotice({ tone = 'info', title, children, action }: {
  tone?: keyof typeof tones;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { icon: Icon, className } = tones[tone];
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', className)}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 space-y-1">
          <p className="text-balance font-medium leading-5 text-foreground">{title}</p>
          {children ? <div className="text-pretty leading-5 text-muted-foreground">{children}</div> : null}
        </div>
        {action ? <div className="shrink-0 self-start sm:self-center">{action}</div> : null}
      </div>
    </div>
  );
}
