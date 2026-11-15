import type { RoadmapSummaryTotals } from '../model/roadmap-summary';
import { cn } from '@/shared/lib/utils';

const countFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function RoadmapSummaryStrip({ summary, month, loading = false }: {
  summary?: RoadmapSummaryTotals;
  month: boolean;
  loading?: boolean;
}) {
  const metrics = [
    { label: 'Эпики', value: summary?.epics, description: 'Эпики в выбранных проектах' },
    { label: 'Фичи', value: summary?.features, description: 'Фичи в выбранных проектах' },
    { label: 'План', value: summary?.planHours, hours: true, description: month ? 'План выбранного месяца' : 'Назначения выбранного квартала; без назначений — оценка Azure DevOps на всю карточку' },
    { label: month ? 'Факт' : 'Факт всего', value: summary?.actualHours, hours: true, description: month ? 'Факт выбранного месяца' : 'Накопленный факт за всё время, как в таблице' },
    { label: 'Ролей', value: summary?.roles, description: 'Роли с учётом фильтра. В общем обзоре одинаковые названия считаются один раз' },
    { label: 'Участников', value: summary?.participants, description: 'Уникальные участники видимых ролей и их назначений в выбранном периоде' },
  ];

  return <dl aria-label="Сводка плана" aria-busy={loading} className="grid w-full grid-cols-3 gap-y-3 sm:grid-cols-6">
    {metrics.map(({ label, value, hours, description }, index) => <div key={label} title={description} className={cn('min-w-0 px-3', index % 3 ? 'border-l border-border' : index ? 'sm:border-l sm:border-border' : undefined)}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-xl">
        {value == null ? <span className="text-muted-foreground">—</span> : <>{countFormat.format(value)}{hours ? <span className="ml-1 text-xs font-normal text-muted-foreground">ч</span> : null}</>}
      </dd>
    </div>)}
  </dl>;
}
