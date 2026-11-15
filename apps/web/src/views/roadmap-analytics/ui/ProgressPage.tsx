'use client';

import { useMemo, useState } from 'react';
import { CircleCheck, TrendingUp } from 'lucide-react';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { cn } from '@/shared/lib/utils';
import { buildProgress, formatHours, formatNumber, formatPercent, statusGroupLabels, type OverrunItem, type ProgressAnalytics, type ProgressEpicRow } from '../model/analytics';
import { AnalyticsShell, type AnalyticsContext } from './AnalyticsShell';
import { AnalyticsPanel, EmptyState, ExpandButton, Meter, Metric, MetricStrip, plural, statusStyles, WorkItemLink } from './analytics-ui';
import styles from './analytics.module.css';

function StatusCard({ statuses, total }: { statuses: ProgressAnalytics['statuses']; total: number }) {
  return <AnalyticsPanel title="Статусы фич" description={`${total} ${plural(total, 'фича', 'фичи', 'фич')} в проекте`}>
    {total ? <div className="px-4 pb-3 sm:px-5">
      <div className="flex h-2 gap-px overflow-hidden rounded-full" aria-hidden="true">
        {statuses.filter((status) => status.count > 0).map((status) => <span key={status.group} style={{ flexGrow: status.count, backgroundColor: statusStyles[status.group].color }} />)}
      </div>
      <ul className="mt-2 divide-y divide-border/55">
        {statuses.map((status) => {
          const { icon: Icon, color } = statusStyles[status.group];
          return <li key={status.group} className="flex items-start justify-between gap-3 py-2 text-[13px]">
            <div className="min-w-0">
              <p className="flex items-center gap-2"><Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden="true" />{statusGroupLabels[status.group]}</p>
              {status.states.length ? <p className="ml-[22px] mt-0.5 break-words text-xs text-muted-foreground">{status.states.map((state) => `${state.name} ${state.count}`).join(' · ')}</p> : null}
            </div>
            <p className="shrink-0 text-right tabular-nums"><strong className="font-semibold">{status.count}</strong> <span className="ml-1 text-xs text-muted-foreground">{formatPercent(status.count, total)}</span></p>
          </li>;
        })}
      </ul>
    </div> : <EmptyState>В проекте пока нет фич.</EmptyState>}
  </AnalyticsPanel>;
}

const overrunPreview = 5;

function OverrunCard({ items }: { items: OverrunItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, overrunPreview);
  return <AnalyticsPanel title="Перерасход" description={items.length ? `${items.length} ${plural(items.length, 'фича', 'фичи', 'фич')} с фактом больше оценки` : 'Факт сравнивается с оценкой фичи'}>
    {items.length ? <>
      <ul className="divide-y divide-border/55 border-t border-border/55">
        {visible.map((item) => <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-red-100/75 text-red-700 dark:bg-red-400/10 dark:text-red-300"><TrendingUp className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <WorkItemLink title={item.title} url={item.url} className="block text-[13px] font-medium leading-snug" />
            <p className="mt-1 text-xs leading-snug text-muted-foreground tabular-nums">
              Факт {formatHours(item.actual)} при оценке {formatHours(item.estimate)} · <span className="font-medium text-red-700 dark:text-red-300">+{Math.round(((item.actual - item.estimate) / item.estimate) * 100)}%</span>
            </p>
          </div>
        </li>)}
      </ul>
      {items.length > overrunPreview ? <ExpandButton expanded={expanded} hidden={items.length - overrunPreview} onToggle={() => setExpanded((value) => !value)} /> : null}
    </> : <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 sm:mx-5 sm:mb-5 dark:bg-emerald-400/10 dark:text-emerald-300">
      <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> Ни одна фича не вышла за оценку
    </div>}
  </AnalyticsPanel>;
}

function EpicsCard({ rows }: { rows: ProgressEpicRow[] }) {
  return <AnalyticsPanel title="Эпики" description="Готовность фич, оценка и факт за всё время">
    {rows.length ? <table className={cn(styles.table, styles.epicsTable)} role="table" aria-label="Готовность, оценка и факт по эпикам">
      <thead role="rowgroup">
        <tr role="row">
          {['Эпик', 'Готовность', 'Оценка', 'Факт'].map((label) => <th key={label} scope="col" role="columnheader">{label}</th>)}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((row) => {
          const isEpic = row.id !== 'no-epic';
          const StateIcon = statusStyles[row.group].icon;
          const overrun = row.estimate > 0 && row.actual > row.estimate;
          return <tr key={row.id} role="row">
            <th scope="row" role="rowheader">
              <div className="flex items-baseline gap-2 font-medium">
                {isEpic ? <AzureWorkItemIcon type="Epic" /> : null}
                <WorkItemLink title={row.title} url={row.url} />
              </div>
              {isEpic ? <p className="mt-1.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <StateIcon className="size-3.5 shrink-0" style={{ color: statusStyles[row.group].color }} aria-hidden="true" />{row.state?.trim() || statusGroupLabels[row.group]}
              </p> : null}
            </th>
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Готовность</span>
              {row.features ? <>
                <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                  <strong className="font-semibold">{formatPercent(row.done, row.features)}</strong>
                  <span className="text-muted-foreground">{row.done} из {row.features}</span>
                </p>
                <Meter value={row.done / row.features} color={statusStyles.done.color} label={`Готовность эпика «${row.title}»`} />
              </> : <span className="text-xs text-muted-foreground">Нет фич</span>}
            </td>
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">Оценка</span>{row.estimate ? formatHours(row.estimate) : <span className="text-muted-foreground">—</span>}</td>
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Факт</span>{row.actual ? formatHours(row.actual) : <span className="text-muted-foreground">—</span>}
              {row.actual && row.estimate ? <p className={cn('mt-0.5 text-xs', overrun ? 'font-medium text-red-700 dark:text-red-300' : 'text-muted-foreground')}>
                {overrun ? <TrendingUp className="mr-1 inline size-3" aria-hidden="true" /> : null}{formatPercent(row.actual, row.estimate)} от оценки
              </p> : null}
            </td>
          </tr>;
        })}
      </tbody>
    </table> : <EmptyState>В проекте пока нет эпиков и фич.</EmptyState>}
  </AnalyticsPanel>;
}

function ProgressContent({ plan }: AnalyticsContext) {
  const data = useMemo(() => buildProgress(plan), [plan]);
  const { counts, hours } = data;
  return <>
    <MetricStrip>
      <Metric
        primary
        label="Готовность проекта"
        value={counts.scope > 0 ? formatPercent(counts.done, counts.scope) : '—'}
        note={counts.scope > 0 ? `Закрыто ${formatNumber(counts.done)} из ${formatNumber(counts.scope)} фич` : undefined}
      />
      <Metric label="Фичи в работе" value={formatNumber(counts.active)} />
      <Metric
        label="Факт по проекту"
        value={formatNumber(hours.actual)}
        unit="ч"
        note={hours.estimate > 0 ? `${formatPercent(hours.actual, hours.estimate)} от оценки ${formatHours(hours.estimate)}` : undefined}
      />
      <Metric label="Фичи с перерасходом" value={formatNumber(data.overruns.length)} />
    </MetricStrip>
    <div className={styles.pair}>
      <StatusCard statuses={data.statuses} total={counts.features} />
      <OverrunCard items={data.overruns} />
    </div>
    <EpicsCard rows={data.epics} />
  </>;
}

export function RoadmapProgressPage() {
  return <AnalyticsShell view="progress">{(context) => <ProgressContent {...context} />}</AnalyticsShell>;
}
