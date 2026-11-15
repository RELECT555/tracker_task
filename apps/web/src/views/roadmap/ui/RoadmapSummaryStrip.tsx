import type { RoadmapSummaryMetrics } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';

const countFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function RoadmapSummaryStrip({ summary, month, loading = false, projects }: {
  summary?: RoadmapSummaryMetrics;
  month: boolean;
  loading?: boolean;
  /** Количество проектов в выборке; показывается только в общем обзоре. */
  projects?: number;
}) {
  const metrics = [
    ...(projects == null ? [] : [{ label: 'Проектов', value: projects, hours: false, accent: false, description: 'Проекты в общем обзоре' }]),
    { label: 'Эпики', value: summary?.epics, hours: false, accent: false, description: 'Эпики в выбранных проектах' },
    { label: 'Фичи', value: summary?.features, hours: false, accent: false, description: 'Фичи в выбранных проектах' },
    { label: 'План', value: summary?.planHours, hours: true, accent: false, description: month ? 'План выбранного месяца' : 'Назначения выбранного квартала; без назначений — оценка Azure DevOps на всю карточку' },
    { label: month ? 'Факт' : 'Факт всего', value: summary?.actualHours, hours: true, accent: true, description: month ? 'Факт выбранного месяца' : 'Накопленный факт за всё время, как в таблице' },
    { label: 'Ролей', value: summary?.roles, hours: false, accent: false, description: 'Роли с учётом фильтра. В общем обзоре одинаковые названия считаются один раз' },
    { label: 'Участников', value: summary?.participants, hours: false, accent: false, description: 'Уникальные участники видимых ролей и их назначений в выбранном периоде' },
  ];

  return <dl
    aria-label="Сводка плана"
    aria-busy={loading}
    // Разделители — зазор в 1px над фоном границы: без двойных линий при любом переносе плиток.
    className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-xs lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
  >
    {metrics.map(({ label, value, hours, accent, description }) => <div
      key={label}
      title={description}
      className="min-w-0 bg-card px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 max-lg:last:odd:col-span-2"
    >
      <dt className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn(
        'mt-1.5 whitespace-nowrap text-2xl font-semibold leading-none tabular-nums tracking-tight',
        accent ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground',
      )}>
        {value == null
          ? loading ? <Skeleton className="h-6 w-14" /> : <span className="text-muted-foreground">—</span>
          : <>{countFormat.format(value)}{hours ? <span className="ml-1 text-xs font-normal tracking-normal text-muted-foreground">ч</span> : null}</>}
      </dd>
    </div>)}
  </dl>;
}
