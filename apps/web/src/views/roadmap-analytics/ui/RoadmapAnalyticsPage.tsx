'use client';

import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, CircleCheck, TrendingUp, UserX } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { useRoadmapProject } from '@/entities/roadmap/model/roadmap-project-selection';
import { useRoadmapCatalog } from '@/entities/roadmap/model/use-roadmap-catalog';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { useAuth } from '@/features/auth/model/useAuth';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import { buildAnalytics, currentQuarterRef, formatHours, formatNumber, formatPercent, shiftQuarter, statusGroupLabels } from '../model/analytics';
import type { AttentionItem, QuarterRef, RoadmapAnalytics, RoleRow } from '../model/analytics';
import { AnalyticsPanel, EmptyState, plural, statusStyles, type RoleLookup } from './analytics-ui';
import { EpicsCard, TeamLoadCard } from './AnalyticsTables';
import { MonthlyLoadChart } from './MonthlyLoadChart';
import styles from './analytics.module.css';

function Metric({ label, value, unit, note, primary }: {
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

function Metrics({ analytics }: { analytics: RoadmapAnalytics }) {
  const { counts, quarter, hours, people } = analytics;
  return <section aria-label="Ключевые показатели">
    <dl className={cn(styles.metrics, 'rounded-xl border border-border/70 dark:border-border')}>
      <Metric
        primary
        label="Оценка на квартал"
        value={formatNumber(quarter.estimate)}
        unit="ч"
        note={quarter.estimate > 0 || quarter.distributed > 0
          ? `По месяцам ${formatHours(quarter.distributed)}`
          : undefined}
      />
      <Metric
        label="Фичи с назначениями"
        value={formatNumber(counts.covered)}
        unit={`из ${formatNumber(counts.open)}`}
      />
      <Metric
        label="Готовность проекта"
        value={counts.features > 0 ? formatPercent(counts.done, counts.features) : '—'}
        note={counts.features > 0 ? `Закрыто ${formatNumber(counts.done)} из ${formatNumber(counts.features)}` : undefined}
      />
      <Metric
        label="Факт по проекту"
        value={formatNumber(hours.actual)}
        unit="ч"
        note={hours.estimate > 0 ? `Оценка ${formatHours(hours.estimate)}` : undefined}
      />
      <Metric
        label="Команда квартала"
        value={formatNumber(people.length)}
        unit={plural(people.length, 'участник', 'участника', 'участников')}
      />
    </dl>
  </section>;
}

function QuarterSwitcher({ quarter, onShift }: { quarter: QuarterRef; onShift: (offset: number) => void }) {
  return <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-card px-0.5 dark:border-border" role="group" aria-label="Выбор квартала">
    <Button type="button" variant="ghost" size="icon" className="size-8 text-foreground" aria-label="Предыдущий квартал" onClick={() => onShift(-1)}><ChevronLeft className="size-4" /></Button>
    <span className="min-w-18 whitespace-nowrap text-center text-sm font-semibold tabular-nums" aria-live="polite">{quarter.label}</span>
    <Button type="button" variant="ghost" size="icon" className="size-8 text-foreground" aria-label="Следующий квартал" onClick={() => onShift(1)}><ChevronRight className="size-4" /></Button>
  </div>;
}

const attentionKinds = {
  unassigned: { label: 'Без назначений', icon: UserX, tone: 'text-muted-foreground bg-muted/50 dark:bg-muted' },
  unspread: { label: 'Не разложено', icon: CalendarClock, tone: 'text-amber-800 bg-amber-100/75 dark:text-amber-300 dark:bg-amber-400/10' },
  overrun: { label: 'Перерасход', icon: TrendingUp, tone: 'text-red-700 bg-red-100/75 dark:text-red-300 dark:bg-red-400/10' },
} as const;

const attentionPreview = 4;
const attentionOrder = ['overrun', 'unspread', 'unassigned'] as const;

function AttentionCard({ items, quarter }: { items: AttentionItem[]; quarter: QuarterRef }) {
  const [filter, setFilter] = useState<AttentionItem['kind'] | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const counts = (Object.keys(attentionKinds) as AttentionItem['kind'][]).map((kind) => ({
    key: kind,
    label: attentionKinds[kind].label,
    count: items.filter((item) => item.kind === kind).length,
  })).filter((entry) => entry.count > 0);
  const activeFilter = counts.some((entry) => entry.key === filter) ? filter : 'all';
  const filtered = activeFilter === 'all'
    ? attentionOrder.flatMap((kind) => items.filter((item) => item.kind === kind))
    : items.filter((item) => item.kind === activeFilter);
  const visible = expanded ? filtered : filtered.slice(0, attentionPreview);

  return <AnalyticsPanel
    title="Требует внимания"
    description={items.length ? `${items.length} ${plural(items.length, 'замечание', 'замечания', 'замечаний')} · ${quarter.label}` : quarter.label}
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
              {item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Открыть «${item.title}» в Azure DevOps`} className="block rounded-sm text-[13px] font-medium leading-snug wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                {item.title} <ArrowUpRight className="inline size-3.5 text-muted-foreground" aria-hidden="true" />
              </a> : <p className="text-[13px] font-medium leading-snug wrap-anywhere">{item.title}</p>}
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{item.kind === 'unassigned' ? item.detail : `${label} · ${item.detail}`}</p>
            </div>
          </li>;
        })}
      </ul>
      {filtered.length > attentionPreview ? <div className="border-t border-border/55 px-3 py-1.5 sm:px-4">
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="text-foreground">{expanded ? 'Свернуть список' : `Показать ещё ${filtered.length - attentionPreview}`}</Button>
      </div> : null}
    </> : <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 sm:mx-5 sm:mb-5 dark:bg-emerald-400/10 dark:text-emerald-300">
      <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> Замечаний к плану нет
    </div>}
  </AnalyticsPanel>;
}

function RolesCard({ roles, quarter }: { roles: RoleRow[]; quarter: QuarterRef }) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const previewCount = 5;
  const visibleRoles = expanded ? roles : roles.slice(0, previewCount);
  const total = roles.reduce((sum, role) => sum + role.quarterHours, 0);
  return <AnalyticsPanel title="Часы по ролям" description={roles.length ? `${quarter.label} · ${formatHours(total)}` : quarter.label}>
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
      {roles.length > previewCount ? <div className="border-t border-border/55 px-3 py-1.5 sm:px-4">
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Свернуть список' : `Показать ещё ${roles.length - previewCount}`}
        </Button>
      </div> : null}
    </> : <EmptyState>Нет назначений на этот квартал.</EmptyState>}
  </AnalyticsPanel>;
}

function StatusCard({ statuses, total }: { statuses: RoadmapAnalytics['statuses']; total: number }) {
  return <AnalyticsPanel title="Статусы фич" description={`${total} ${plural(total, 'фича', 'фичи', 'фич')} по всему проекту`}>
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

export function RoadmapAnalyticsPage() {
  const { user } = useAuth();
  const { projects, azureQuery: projectsQuery, localQuery, loading: catalogLoading } = useRoadmapCatalog(isAdminUser(user) && !isRoadmapDemoMode());
  const [quarter, setQuarter] = useState(currentQuarterRef);
  const { project, ready: projectSelectionReady, selectProject } = useRoadmapProject(projects, { catalogLoading: projectsQuery.isLoading });
  const activeProjectId = project?.id ?? '';
  const roadmapProjectId = project?.roadmapId ?? '';

  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const plan = planQuery.isError ? undefined : planQuery.data;
  const analytics = useMemo(() => plan ? buildAnalytics(plan, quarter) : null, [plan, quarter]);
  const roles = useMemo<RoleLookup>(() => {
    const lookup: RoleLookup = new Map((plan?.roles ?? []).map((role) => [role.id, role]));
    for (const item of plan?.workItems ?? []) {
      for (const allocation of item.allocations) {
        if (!lookup.has(allocation.roleId)) lookup.set(allocation.roleId, allocation.role);
      }
    }
    return lookup;
  }, [plan]);
  const error = localQuery.error ?? projectsQuery.error ?? planQuery.error;
  const loading = !projectSelectionReady || catalogLoading || (projectsQuery.isLoading && !project) || planQuery.isLoading;
  const syncTimestamp = Date.parse(plan?.syncedAt ?? '');
  const syncedAt = Number.isFinite(syncTimestamp) ? new Date(syncTimestamp) : null;
  const contextKey = `${roadmapProjectId}-${quarter.key}`;

  return <main className={cn(styles.dashboard, 'roadmap-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-none px-4 py-4 sm:px-6 sm:py-6 lg:px-8')}>
    <div className={cn(styles.content, 'w-full space-y-4')}>
      <header className={styles.header}>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[30px]">Аналитика</h1>
          {plan ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {syncedAt ? <>Синхронизация <time dateTime={syncedAt.toISOString()}>{syncedAt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</time></> : 'Проект ещё не синхронизирован'}
          </p> : null}
        </div>
        <QuarterSwitcher quarter={quarter} onShift={(offset) => setQuarter((current) => shiftQuarter(current, offset))} />
        <AzureProjectPicker projects={projects} value={activeProjectId} onChange={selectProject} disabled={catalogLoading || !projectSelectionReady} placeholder="Выбрать проект" className={styles.projectPicker} />
      </header>

      <QueryErrorNotice title="Не удалось загрузить аналитику" queries={[localQuery, projectsQuery, ...(roadmapProjectId ? [planQuery] : [])]} />

      {loading ? <div className="space-y-4" role="status">
        <span className="sr-only">Загрузка аналитики</span>
        <div className="h-40 rounded-xl border border-border/70 bg-card motion-safe:animate-pulse" />
        <div className={styles.columns}><div className="h-80 rounded-xl border border-border/70 bg-card motion-safe:animate-pulse" /><div className="h-80 rounded-xl border border-border/70 bg-card motion-safe:animate-pulse" /></div>
      </div> : analytics ? <>
        <Metrics analytics={analytics} />
        <div className={styles.columns} key={contextKey}>
          <MonthlyLoadChart months={analytics.months} roles={roles} quarter={quarter} />
          <AttentionCard items={analytics.attention} quarter={quarter} />
        </div>
        <div className={styles.columns}>
          <TeamLoadCard key={contextKey} people={analytics.people} roles={roles} quarter={quarter} />
          <div className="min-w-0 space-y-4">
            <RolesCard key={contextKey} roles={analytics.roles} quarter={quarter} />
            <StatusCard statuses={analytics.statuses} total={analytics.counts.features} />
          </div>
        </div>
        <EpicsCard rows={analytics.epicRows} roles={roles} quarter={quarter} />
      </> : !error ? <Card className="px-4 py-8 text-center shadow-none">
        <p className="font-semibold">{projects.length ? 'Проект ещё не импортирован' : 'Пока нет проектов'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{projects.length ? 'Выберите импортированный проект для просмотра аналитики.' : 'Импортируйте проект в Roadmap, чтобы увидеть его метрики.'}</p>
      </Card> : null}
    </div>
  </main>;
}
