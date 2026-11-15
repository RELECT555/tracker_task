import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { RoadmapWriteBackMode } from '@/entities/roadmap/api/roadmapApi';
import { getErrorMessage } from '@/shared/lib/error-message';
import { AdminCard } from '../AdminLayout';

export const integrationColors = '[html:not(.dark)_&]:[--primary:239_75%_56%] [html:not(.dark)_&]:[--destructive:0_72%_44%] dark:[--destructive:0_80%_72%] dark:[--destructive-foreground:0_0%_5%]';

export const MODE_LABEL: Record<RoadmapWriteBackMode, string> = {
  off: 'Выключено',
  manual: 'По кнопке',
  auto: 'Автоматически',
};

/** AdminCard with optional header actions, used by the integration tabs. */
export function Panel({ title, titleProps, description, icon, actions, children }: {
  title: string;
  titleProps?: ComponentProps<typeof AdminCard>['titleProps'];
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminCard
      title={title}
      titleProps={titleProps}
      description={description}
      icon={icon}
      className={actions ? '[&>div:first-child]:flex-wrap [&>div:first-child>div:first-child]:grow [&>div:first-child>div:first-child]:basis-56' : undefined}
      badge={actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : undefined}
    >
      {children}
    </AdminCard>
  );
}

export function CheckStatusIcon({ status }: { status: 'ok' | 'warning' | 'error' }) {
  if (status === 'ok') return <CheckCircle2 role="img" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="В порядке" />;
  if (status === 'warning') return <AlertTriangle role="img" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Предупреждение" />;
  return <AlertCircle role="img" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Ошибка" />;
}

export function Chip({ tone = 'muted', children, title }: { tone?: 'muted' | 'ok' | 'warn' | 'error' | 'info'; children: ReactNode; title?: string }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    error: 'bg-destructive/10 text-destructive',
    info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  };
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${tones[tone]}`}>{children}</span>;
}

export function errorText(error: unknown) {
  return getErrorMessage(error);
}
