import type { ReactNode } from 'react';
import { ArrowUpRight, Circle, CircleCheck, CircleDot, CircleX } from 'lucide-react';
import { Button } from '@/shared/ui/button';
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

export function AnalyticsPanel({ title, description, children }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return <Card className={cn(styles.panel, 'min-w-0 border-border/70 shadow-none dark:border-border')}>
    <div className="px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
      <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </Card>;
}

export function Metric({ label, value, unit, note, primary }: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  primary?: boolean;
}) {
  return <div className={cn(styles.metric, primary && styles.primaryMetric)}>
    <dt className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</dt>
    <dd className="text-[24px] font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-[30px]">
      {value}{unit ? <> <span className="text-sm font-medium tracking-normal text-muted-foreground">{unit}</span></> : null}
    </dd>
    {note ? <dd className="text-xs tabular-nums text-muted-foreground">{note}</dd> : null}
  </div>;
}

export function MetricStrip({ children }: { children: ReactNode }) {
  return <section aria-label="Ключевые показатели">
    <dl className={cn(styles.metrics, 'rounded-xl border border-border/70 dark:border-border')}>{children}</dl>
  </section>;
}

export function ExpandButton({ expanded, hidden, onToggle, controls }: { expanded: boolean; hidden: number; onToggle: () => void; controls?: string }) {
  return <div className="border-t border-border/55 px-3 py-1.5 sm:px-4">
    <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} aria-controls={controls} onClick={onToggle} className="text-foreground">
      {expanded ? 'Свернуть список' : `Показать ещё ${hidden}`}
    </Button>
  </div>;
}

export function WorkItemLink({ title, url, className }: { title: string; url: string | null; className?: string }) {
  return url
    ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Открыть «${title}» в Azure DevOps`} className={cn('min-w-0 rounded-sm wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-ring', className)}>
      {title} <ArrowUpRight className="inline size-3.5 text-muted-foreground" aria-hidden="true" />
    </a>
    : <span className={cn('min-w-0 wrap-anywhere', className)}>{title}</span>;
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
