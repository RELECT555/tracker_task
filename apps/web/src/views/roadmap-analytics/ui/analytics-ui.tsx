import type { ReactNode } from 'react';
import { Circle, CircleCheck, CircleDot, CircleX } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/utils';
import type { StatusGroup } from '../model/analytics';
import styles from './analytics.module.css';

export type RoleLookup = Map<string, { id: string; name: string; color: string }>;

export const statusStyles = {
  done: { color: 'var(--analytics-done)', icon: CircleCheck },
  active: { color: 'hsl(var(--primary))', icon: CircleDot },
  new: { color: 'hsl(var(--muted-foreground))', icon: Circle },
  removed: { color: 'hsl(var(--muted-foreground) / 0.5)', icon: CircleX },
} satisfies Record<StatusGroup, { color: string; icon: typeof Circle }>;

export function AnalyticsPanel({ title, description, aside, children }: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return <Card className={cn(styles.panel, 'min-w-0 border-border/70 shadow-none dark:border-border')}>
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {aside}
    </div>
    {children}
  </Card>;
}

export function Meter({ value, color = 'hsl(var(--primary))', label }: { value: number; color?: string; label: string }) {
  const percent = Math.max(0, Math.min(100, value * 100));
  return <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="h-1 overflow-hidden rounded-full bg-muted/70">
    <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
  </div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="mx-4 mb-4 rounded-lg border border-dashed border-border bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground sm:mx-5 sm:mb-5">{children}</p>;
}

export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
