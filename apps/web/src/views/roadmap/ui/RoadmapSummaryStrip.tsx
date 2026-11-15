import type { RoadmapSummaryMetrics } from '@tracker/shared';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';

const countFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

type Metric = {
  label: string;
  value?: number | null;
  hours: boolean;
  description: string;
  /** Подпись под значением; `over` подсвечивает реальное превышение плана. */
  note?: { text: string; over: boolean } | null;
};

export function RoadmapSummaryStrip({ summary, month, loading = false, projects }: {
  summary?: RoadmapSummaryMetrics;
  month: boolean;
  loading?: boolean;
  /** Количество проектов в выборке; показывается только в общем обзоре. */
  projects?: number;
}) {
  // Цвет значений намеренно нейтральный: в квартальном режиме план (квартал) и факт (всё время)
  // несопоставимы, поэтому окраска «в норме / превышено» вводила бы в заблуждение.
  // В режиме месяца план и факт относятся к одному периоду — только тогда показываем долю факта от плана.
  const plan = summary?.planHours;
  const fact = summary?.actualHours;
  const factShare = month && plan != null && fact != null && plan > 0 ? Math.round((fact / plan) * 100) : null;
  const factNote = factShare == null ? null : {
    text: `${factShare}% от плана`,
    over: factShare > 100,
  };

  const metrics: Metric[] = [
    ...(projects == null ? [] : [{ label: 'Проектов', value: projects, hours: false, description: 'Проекты в общем обзоре' }]),
    { label: 'Эпики', value: summary?.epics, hours: false, description: 'Эпики в выбранных проектах' },
    { label: 'Фичи', value: summary?.features, hours: false, description: 'Фичи в выбранных проектах' },
    { label: 'План', value: summary?.planHours, hours: true, description: month ? 'План выбранного месяца' : 'Назначения выбранного квартала; без назначений — оценка Azure DevOps на всю карточку' },
    { label: month ? 'Факт' : 'Факт всего', value: summary?.actualHours, hours: true, note: factNote, description: month ? 'Факт выбранного месяца' : 'Накопленный факт за всё время, как в таблице' },
    { label: 'Ролей', value: summary?.roles, hours: false, description: 'Роли с учётом фильтра. В общем обзоре одинаковые названия считаются один раз' },
    { label: 'Участников', value: summary?.participants, hours: false, description: 'Уникальные участники видимых ролей и их назначений в выбранном периоде' },
  ];

  return <dl
    aria-label="Сводка плана"
    aria-busy={loading}
    className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
  >
    {metrics.map(({ label, value, hours, description, note }) => <div
      key={label}
      title={description}
      className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-xs transition-colors hover:border-foreground/15 sm:px-5 sm:py-4"
    >
      <dt className="truncate text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-2 whitespace-nowrap text-[26px] font-semibold leading-none tabular-nums tracking-tight text-foreground">
        {value == null
          ? loading ? <Skeleton className="h-7 w-16" /> : <span className="text-muted-foreground">—</span>
          : <>{countFormat.format(value)}{hours ? <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">ч</span> : null}</>}
      </dd>
      {note ? <dd
        title={note.over ? 'Факт месяца превышает план' : undefined}
        className={cn('mt-2 truncate text-xs tabular-nums', note.over ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}
      >{note.text}</dd> : null}
    </div>)}
  </dl>;
}
