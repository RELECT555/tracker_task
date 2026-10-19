import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { RoadmapWriteBackMode } from '@/entities/roadmap/api/roadmapApi';
import { AdminCard } from '../AdminLayout';

export const MODE_LABEL: Record<RoadmapWriteBackMode, string> = {
  off: 'Выключено',
  manual: 'По кнопке',
  auto: 'Автоматически',
};

/** AdminCard with optional header actions, used by the integration tabs. */
export function Panel({ title, description, icon, actions, children }: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminCard
      title={title}
      description={description}
      icon={icon}
      badge={actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : undefined}
    >
      {children}
    </AdminCard>
  );
}

export function CheckStatusIcon({ status }: { status: 'ok' | 'warning' | 'error' }) {
  if (status === 'ok') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="В порядке" />;
  if (status === 'warning') return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Предупреждение" />;
  return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Ошибка" />;
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
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}
