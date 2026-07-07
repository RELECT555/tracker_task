import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export function DetailSection({
  title,
  icon: Icon,
  badge,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-6 py-5', className)}>
      <div className="mb-4 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}
