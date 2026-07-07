import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export function DetailSection({
  title,
  icon: Icon,
  badge,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card text-card-foreground',
        'shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)]',
        'dark:shadow-none',
        className,
      )}
    >
      <header className="flex items-center gap-3 border-b border-border bg-muted px-5 py-3.5 dark:bg-muted/12">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {badge}
        </div>
      </header>
      <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate font-medium', mono && 'font-mono text-sm tabular-nums')}>
        {value}
      </dd>
    </div>
  );
}
