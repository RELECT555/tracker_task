'use client';

import { useId, useMemo, useState } from 'react';
import Link from '@/shared/lib/router/link';
import { CalendarClock, CircleCheck, UserX } from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import { buildCapacity, formatHours, formatNumber, formatPercent, type AttentionItem, type QuarterEpicRow, type QuarterRef, type RoleRow } from '../model/analytics';
import { AnalyticsShell, type AnalyticsContext } from './AnalyticsShell';
import { AnalyticsPanel, EmptyState, ExpandButton, Metric, MetricStrip, plural, WorkItemLink, type RoleLookup } from './analytics-ui';
import { TeamLoadCard } from './TeamLoadCard';
import styles from './analytics.module.css';

const attentionKinds = {
  unspread: { label: 'Не разложено', icon: CalendarClock, tone: 'text-amber-800 bg-amber-100/75 dark:text-amber-300 dark:bg-amber-400/10' },
  unassigned: { label: 'Без назначений', icon: UserX, tone: 'text-muted-foreground bg-muted/50 dark:bg-muted' },
} as const;

const attentionPreview = 5;

function AttentionCard({ items, quarter }: { items: AttentionItem[]; quarter: QuarterRef }) {
  const [filter, setFilter] = useState<AttentionItem['kind'] | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const counts = (Object.keys(attentionKinds) as AttentionItem['kind'][])
    .map((kind) => ({ key: kind, label: attentionKinds[kind].label, count: items.filter((item) => item.kind === kind).length }))
    .filter((entry) => entry.count > 0);
  const activeFilter = counts.some((entry) => entry.key === filter) ? filter : 'all';
  const filtered = activeFilter === 'all' ? items : items.filter((item) => item.kind === activeFilter);
  const visible = expanded ? filtered : filtered.slice(0, attentionPreview);

  return <AnalyticsPanel
    title="Замечания к плану"
    description={items.length ? `${items.length} ${plural(items.length, 'фича', 'фичи', 'фич')} · ${quarter.label}` : quarter.label}
  >
    {items.length ? <>
      {counts.length > 1 ? <div className="flex flex-wrap gap-1.5 px-4 pb-3 sm:px-5" role="group" aria-label="Фильтр замечаний">
        {[{ key: 'all' as const, label: 'Все', count: items.length }, ...counts].map((entry) => <Button
          key={entry.key}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={entry.key === activeFilter}
          className={cn('h-8 gap-1.5 border border-border/75 px-2 text-foreground', entry.key === activeFilter && 'border-primary/40 bg-primary/10 font-semibold hover:bg-primary/15')}
          onClick={() => { setFilter(entry.key); setExpanded(false); }}
        >{entry.label} <span className="tabular-nums text-muted-foreground">{entry.count}</span></Button>)}
      </div> : null}
      <ul className="divide-y divide-border/55 border-t border-border/55">
        {visible.map((item) => {
          const { icon: Icon, label, tone } = attentionKinds[item.kind];
          return <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5">
            <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md', tone)} title={label}><Icon className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <WorkItemLink title={item.title} url={item.url} className="block text-[13px] font-medium leading-snug" />
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{item.kind === 'unassigned' ? item.detail : `${label} · ${item.detail}`}</p>
            </div>
          </li>;
        })}
      </ul>
      {filtered.length > attentionPreview ? <ExpandButton expanded={expanded} hidden={filtered.length - attentionPreview} onToggle={() => setExpanded((value) => !value)} /> : null}
    </> : <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 sm:mx-5 sm:mb-5 dark:bg-emerald-400/10 dark:text-emerald-300">
      <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> Все открытые фичи назначены и разложены по месяцам
    </div>}
  </AnalyticsPanel>;
}

function RolesCard({ roles, quarter }: { roles: RoleRow[]; quarter: QuarterRef }) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const previewCount = 5;
  const visibleRoles = expanded ? roles : roles.slice(0, previewCount);
  const total = roles.reduce((sum, role) => sum + role.quarterHours, 0);
  return <AnalyticsPanel title="Часы по ролям" description={roles.length ? `${quarter.label} · ${formatHours(total)} по месяцам` : quarter.label}>
    {roles.length ? <>
      <ul id={listId} className="divide-y divide-border/55 border-t border-border/55">
        {visibleRoles.map((role) => <li key={role.id} className="flex items-start justify-between gap-3 px-4 py-2 text-[13px] sm:px-5">
          <span className="flex min-w-0 items-center gap-2 font-medium"><ColorMark color={role.color} size="sm" /><span className="wrap-anywhere">{role.name}</span></span>
          <span className="shrink-0 text-right font-semibold tabular-nums">
            {formatHours(role.quarterHours)}
            {Math.abs(role.estimate - role.quarterHours) >= 0.5 ? <span className="block text-xs font-normal text-muted-foreground">Оценка {formatHours(role.estimate)}</span> : null}
          </span>
        </li>)}
      </ul>
      {roles.length > previewCount ? <ExpandButton expanded={expanded} hidden={roles.length - previewCount} controls={listId} onToggle={() => setExpanded((value) => !value)} /> : null}
    </> : <EmptyState>Нет назначений на этот квартал.</EmptyState>}
  </AnalyticsPanel>;
}

function QuarterEpicsCard({ rows, roles, quarter }: { rows: QuarterEpicRow[]; roles: RoleLookup; quarter: QuarterRef }) {
  return <AnalyticsPanel title="Эпики в квартале" description={`Только эпики с назначениями на ${quarter.label}`}>
    {rows.length ? <table className={cn(styles.table, styles.epicsTable)} role="table" aria-label={`Часы по эпикам в ${quarter.label}`}>
      <thead role="rowgroup">
        <tr role="row">
          {['Эпик', 'Роли', 'По месяцам', 'Оценка'].map((label) => <th key={label} scope="col" role="columnheader">{label}</th>)}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((row) => {
          const shares = [...roles.keys()].flatMap((roleId) => row.byRole.filter((share) => share.roleId === roleId));
          return <tr key={row.id} role="row">
            <th scope="row" role="rowheader"><WorkItemLink title={row.title} url={row.url} className="font-medium" /></th>
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Роли</span>
              {shares.length ? <>
                <div className="mb-2 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                  {shares.map((share) => <span key={share.roleId} style={{ flexGrow: share.hours, backgroundColor: roles.get(share.roleId)?.color }} />)}
                </div>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Часы по ролям">
                  {shares.map((share) => <li key={share.roleId}>{roles.get(share.roleId)?.name} <span className="tabular-nums text-foreground">{formatHours(share.hours)}</span></li>)}
                </ul>
              </> : <span className="text-xs text-muted-foreground">Часы не разложены</span>}
            </td>
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">По месяцам</span><strong className="font-semibold">{formatHours(row.quarterHours)}</strong></td>
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">Оценка</span>{formatHours(row.estimate)}</td>
          </tr>;
        })}
      </tbody>
    </table> : <EmptyState>На {quarter.label} нет назначений ни в одном эпике.</EmptyState>}
  </AnalyticsPanel>;
}

function CapacityContent({ plan, roles, quarter, projectKey }: AnalyticsContext) {
  const data = useMemo(() => buildCapacity(plan, quarter), [plan, quarter]);
  const contextKey = `${projectKey}-${quarter.key}`;
  const undistributed = data.estimate - data.distributed;

  return <>
    <MetricStrip>
      <Metric primary label="Оценка на квартал" value={formatNumber(data.estimate)} unit="ч" />
      <Metric
        label="Разложено по месяцам"
        value={data.estimate > 0 ? formatPercent(data.distributed, data.estimate) : '—'}
        note={data.estimate > 0 ? `${formatHours(data.distributed)} из ${formatHours(data.estimate)}` : undefined}
      />
      <Metric label="Открытые фичи с назначениями" value={formatNumber(data.features.covered)} unit={`из ${formatNumber(data.features.open)}`} />
      <Metric
        label="Загрузка команды"
        value={data.capacity.team > 0 ? formatPercent(data.distributed, data.capacity.team) : '—'}
        note={data.capacity.team > 0
          ? `${formatHours(data.distributed)} из ${formatHours(data.capacity.team)} нормы · ${formatNumber(data.people.length)} ${plural(data.people.length, 'участник', 'участника', 'участников')}${data.capacity.overloaded ? `, ${data.capacity.overloaded} с перегрузом` : ''}`
          : 'Никто не назначен'}
      />
    </MetricStrip>

    {undistributed >= 0.5 ? <div className="flex flex-col gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200" role="status">
      <p className="flex items-start gap-2.5"><CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span><strong className="font-semibold tabular-nums">{formatHours(undistributed)}</strong> оценки не разложены по месяцам, поэтому загрузка команды неполная.</span>
      </p>
      <Link href={routes.roadmap} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/60 bg-card px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Открыть план</Link>
    </div> : null}

    <div className={styles.columns} key={contextKey}>
      <TeamLoadCard people={data.people} roles={roles} quarter={quarter} monthNorms={data.capacity.monthNorms} overloaded={data.capacity.overloaded} />
      <div className="min-w-0 space-y-4">
        <AttentionCard items={data.attention} quarter={quarter} />
        <RolesCard roles={data.roles} quarter={quarter} />
      </div>
    </div>
    <QuarterEpicsCard rows={data.epics} roles={roles} quarter={quarter} />
  </>;
}

export function RoadmapCapacityPage() {
  return <AnalyticsShell view="capacity">{(context) => <CapacityContent {...context} />}</AnalyticsShell>;
}
