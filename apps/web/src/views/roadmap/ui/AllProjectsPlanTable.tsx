'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRoadmapSummary, type RoadmapProjectOverview, type RoadmapSummary, type RoadmapSummaryMetrics, type RoadmapTablePreferences } from '@tracker/shared';
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FolderOpen, Layers, Search } from 'lucide-react';
import { getRoadmapMonthlyFact, roadmapApi, roadmapMonthlyFactQueryKey, roadmapPlanQueryKey, type AzureProject, type RoadmapRole, type RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { WorkItemStateBadge } from '@/entities/roadmap/ui/WorkItemStateBadge';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { IconButton } from '@/shared/ui/icon-button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { downloadCsv } from '../model/roadmap-csv';
import type { ColumnWidthConfig, ColumnWidthsApi } from '../model/use-roadmap-column-widths';
import { ColumnResizeHandle, planColumnOffset, ResizablePlanTable, type PlanColumn } from './ResizablePlanTable';

type ProjectSummary = RoadmapSummary<RoadmapWorkItem, RoadmapRole>;

type ImportedProject = AzureProject & { roadmapId: string };

type DetailPeriod = {
  quarterKey: string;
  monthKey?: string;
  plannedRolesOnly: boolean;
  includeChildEpics: boolean;
  showFact: boolean;
  refreshInterval: number | false;
};

function toggle(set: Set<string>, key: string) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

type SortKey = 'name' | 'epics' | 'features' | 'plan' | 'fact' | 'done' | 'delta' | 'roles' | 'participants';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

/** These columns exist only when fact is shown. */
const FACT_SORT_KEYS: SortKey[] = ['fact', 'done', 'delta'];

/** Name sorts A→Я first, numbers largest first; a third click resets the order. */
function nextSort(current: SortState, key: SortKey): SortState {
  const first = key === 'name' ? 'asc' : 'desc';
  if (current?.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === 'asc' ? 'desc' : 'asc' };
  return null;
}

function sortValue(key: SortKey, project: ImportedProject, summary?: RoadmapProjectOverview): number | string | null {
  if (key === 'name') return project.name;
  const metrics = summary?.metrics;
  if (!metrics) return null;
  switch (key) {
    case 'epics': return metrics.epics;
    case 'features': return metrics.features;
    case 'plan': return metrics.planHours;
    case 'fact': return metrics.actualHours;
    case 'done': return donePercent(metrics);
    case 'delta': return deltaOf(metrics);
    case 'roles': return metrics.roles;
    case 'participants': return metrics.participants;
  }
}

const VIEW_STORAGE_KEY = 'roadmap-all-projects-view';

type StoredView = { projects?: string[]; epics?: string[]; sort?: SortState };

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** Expanded rows and sort order are a per-browser convenience, so every storage failure is ignored. */
function readStoredView(): StoredView {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return {};
    const { projects, epics, sort } = stored as Record<string, unknown>;
    const validSort = sort && typeof sort === 'object'
      && ['name', 'epics', 'features', 'plan', 'fact', 'done', 'delta', 'roles', 'participants'].includes((sort as { key?: string }).key ?? '')
      && ['asc', 'desc'].includes((sort as { dir?: string }).dir ?? '');
    return {
      projects: isStringList(projects) ? projects : undefined,
      epics: isStringList(epics) ? epics : undefined,
      sort: validSort ? sort as SortState : undefined,
    };
  } catch {
    return {};
  }
}

function writeStoredView(view: StoredView) {
  try { window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view)); } catch { /* optional convenience */ }
}

type ColumnSizing = ColumnWidthConfig & { grow?: boolean };

// Defaults fit a laptop-wide panel without horizontal scroll; the name column takes whatever is left.
const NAME_SIZING: ColumnSizing = { defaultWidth: 300, minWidth: 240, grow: true };
const HOURS_SIZING: ColumnSizing = { defaultWidth: 100, minWidth: 84, maxWidth: 480 };
const DONE_SIZING: ColumnSizing = { defaultWidth: 120, minWidth: 108, maxWidth: 320 };
const PEOPLE_SIZING: ColumnSizing = { defaultWidth: 120, minWidth: 96, maxWidth: 320 };
const COUNT_SIZING: ColumnSizing = { defaultWidth: 84, minWidth: 72, maxWidth: 320 };

type ColumnDef = { id: SortKey; label: string; unit?: string; title?: string; sizing: ColumnSizing };

/** Same order as the project table: totals right after the name, so they can be pinned together. */
function columnDefs(showFact: boolean, monthKey?: string): ColumnDef[] {
  return [
    { id: 'name', label: 'Проект / эпик / фича', sizing: NAME_SIZING },
    { id: 'plan', label: 'План', unit: monthKey ? 'за месяц, ч' : 'итого, ч', title: monthKey ? 'План выбранного месяца' : 'План выбранного квартала', sizing: HOURS_SIZING },
    ...(showFact ? [
      { id: 'fact', label: 'Факт', unit: monthKey ? 'за месяц, ч' : 'всего, ч', title: monthKey ? 'Факт за выбранный месяц' : 'Накопленный факт за всё время', sizing: HOURS_SIZING },
      { id: 'done', label: 'Выполнено', unit: '% от плана', title: 'Факт в процентах от плана', sizing: DONE_SIZING },
      { id: 'delta', label: 'Δ', unit: 'ч', title: 'Дельта: факт − план. Плюс означает перерасход', sizing: HOURS_SIZING },
    ] satisfies ColumnDef[] : []),
    { id: 'epics', label: 'Эпики', sizing: COUNT_SIZING },
    { id: 'features', label: 'Фичи', sizing: COUNT_SIZING },
    { id: 'roles', label: 'Роли', sizing: COUNT_SIZING },
    { id: 'participants', label: 'Участники', sizing: PEOPLE_SIZING },
  ];
}

/** Widths are stored next to the project table's ones, so they need their own namespace. */
const widthKey = (id: string) => `portfolio:${id}`;

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const EMPTY_VALUE_CLASS = 'text-muted-foreground/40';
const metricClass = 'whitespace-nowrap border-l border-border/60 px-3 py-2.5 text-right text-sm tabular-nums';
const PLURALS = new Intl.PluralRules('ru-RU');

function plural(count: number, one: string, few: string, many: string) {
  const form = PLURALS.select(count);
  return `${count} ${form === 'one' ? one : form === 'few' ? few : many}`;
}

/** Units live in the column header, cells show bare numbers like in the project table. */
function cellNumber(value: number | null | undefined) {
  return value === null || value === undefined || value === 0 ? '—' : numberFormat.format(value);
}

/** Fact minus plan; positive means the plan is exceeded. */
function deltaOf(summary?: RoadmapSummaryMetrics) {
  if (!summary || summary.actualHours === null) return null;
  return Number((summary.actualHours - summary.planHours).toFixed(2));
}

function donePercent(summary?: RoadmapSummaryMetrics) {
  if (!summary || summary.actualHours === null || summary.planHours <= 0) return null;
  return Math.round((summary.actualHours / summary.planHours) * 100);
}

type Pin = (id: SortKey) => { className?: string; style?: CSSProperties };
type RowLevel = 'project' | 'epic' | 'feature';

function Metrics({ summary, showFact, loading = false, level, pin }: {
  summary?: RoadmapSummaryMetrics; showFact: boolean; loading?: boolean; level: RowLevel; pin: Pin;
}) {
  const strong = level === 'feature' ? 'text-foreground/90' : 'font-semibold text-foreground';
  const pinned = (id: SortKey, className: string) => ({ style: pin(id).style, className: cn(metricClass, pin(id).className, className) });
  if (!summary && loading) {
    const ids: SortKey[] = ['plan', ...(showFact ? ['fact', 'done', 'delta'] as SortKey[] : []), 'epics', 'features', 'roles', 'participants'];
    return <>{ids.map((id) => <td key={id} {...pinned(id, '')}><Skeleton className="ml-auto h-3 w-8" /></td>)}</>;
  }
  const percent = donePercent(summary);
  const delta = deltaOf(summary);
  const count = (value: number | undefined) => <td className={cn(metricClass, value ? 'text-muted-foreground' : EMPTY_VALUE_CLASS)}>{cellNumber(value)}</td>;
  return <>
    <td {...pinned('plan', summary?.planHours ? strong : EMPTY_VALUE_CLASS)}>{cellNumber(summary?.planHours)}</td>
    {showFact ? <>
      <td {...pinned('fact', summary?.actualHours ? strong : EMPTY_VALUE_CLASS)}>{cellNumber(summary?.actualHours)}</td>
      <td className={metricClass}>{percent === null ? <span className={EMPTY_VALUE_CLASS}>—</span> : <span className="inline-flex items-center justify-end gap-2" title={`Факт — ${percent}% от плана`}>
        <span aria-hidden="true" className="h-[3px] w-12 overflow-hidden rounded-full bg-border/60">
          <span className={cn('block h-full rounded-full', percent > 100 ? 'bg-amber-500/80' : 'bg-primary/60')} style={{ width: `${Math.min(percent, 100)}%` }} />
        </span>
        <span className={cn('w-10 text-right', percent > 100 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-foreground')}>{percent}%</span>
      </span>}</td>
      <td title="Дельта = факт − план" className={cn(metricClass, delta !== null && delta > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : delta ? 'text-foreground' : EMPTY_VALUE_CLASS)}>
        {delta === null || delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${numberFormat.format(Math.abs(delta))}`}
      </td>
    </> : null}
    {count(summary?.epics)}
    {count(summary?.features)}
    {count(summary?.roles)}
    {count(summary?.participants)}
  </>;
}

/**
 * Include descendants through intermediate Azure cards, without rendering those cards twice.
 * Without `includeChildEpics` a child epic and everything under it belong to that epic only.
 */
function descendantItems(item: RoadmapWorkItem, items: RoadmapWorkItem[], includeChildEpics: boolean) {
  const byExternalId = new Map(items.map((entry) => [entry.externalId, entry]));
  return items.filter((entry) => {
    let current: RoadmapWorkItem | undefined = entry;
    const visited = new Set<string>();
    while (current && !visited.has(current.externalId)) {
      if (current.id === item.id) return true;
      if (!includeChildEpics && current.type.toLowerCase() === 'epic') return false;
      visited.add(current.externalId);
      current = current.parentExternalId ? byExternalId.get(current.parentExternalId) : undefined;
    }
    return false;
  });
}

function assignmentCounts(items: RoadmapWorkItem[], visibleRoles: RoadmapRole[], byRole?: Map<string, number>) {
  const allocations = items.flatMap((entry) => entry.allocations);
  const relevantRoles = visibleRoles.filter((role) => (byRole?.get(role.id) ?? 0) > 0
    || allocations.some((allocation) => allocation.roleId === role.id));
  const roleIds = new Set(relevantRoles.map((role) => role.id));
  const participants = new Set<string>();
  for (const role of relevantRoles) {
    if (role.members) {
      for (const member of role.members) {
        if (member.personIsActive !== false && member.personExternalId.trim()) participants.add(member.personExternalId.trim());
      }
    } else if (role.defaultPersonExternalId?.trim()) participants.add(role.defaultPersonExternalId.trim());
  }
  for (const allocation of allocations) {
    if (roleIds.has(allocation.roleId) && allocation.personExternalId.trim()) participants.add(allocation.personExternalId.trim());
  }
  return { roles: relevantRoles.length, participants: participants.size };
}

function itemSummary(item: RoadmapWorkItem, summary: ProjectSummary, includeChildEpics: boolean) {
  const items = descendantItems(item, summary.items, includeChildEpics);
  const byRole = summary.rolePlan.byItem.get(item.id);
  return {
    epics: items.filter((entry) => entry.type.toLowerCase() === 'epic').length,
    features: items.filter((entry) => entry.type.toLowerCase() === 'feature').length,
    planHours: [...(byRole?.values() ?? [])].reduce((sum, value) => sum + value, 0),
    actualHours: item.actualHours === null ? null : Number(item.actualHours),
    ...assignmentCounts(items, summary.visibleRoles, byRole),
  };
}

/** Sums the features that have no epic, the way an epic row sums its children. */
function standaloneSummary(features: RoadmapWorkItem[], summary: ProjectSummary) {
  const byRole = new Map<string, number>();
  let planHours = 0;
  for (const feature of features) {
    for (const [roleId, hours] of summary.rolePlan.byItem.get(feature.id) ?? []) {
      byRole.set(roleId, (byRole.get(roleId) ?? 0) + hours);
      planHours += hours;
    }
  }
  const facts = features.filter((feature) => feature.actualHours !== null);
  return {
    epics: 0,
    features: features.length,
    planHours,
    actualHours: facts.length ? facts.reduce((sum, feature) => sum + Number(feature.actualHours), 0) : null,
    ...assignmentCounts(features, summary.visibleRoles, byRole),
  };
}

function unattachedSummary(summary: ProjectSummary, planHours: number) {
  const byExternalId = new Map(summary.items.map((item) => [item.externalId, item]));
  const items = summary.items.filter((item) => {
    let current: RoadmapWorkItem | undefined = item;
    const visited = new Set<string>();
    while (current && !visited.has(current.externalId)) {
      if (['epic', 'feature'].includes(current.type.toLowerCase())) return false;
      visited.add(current.externalId);
      current = current.parentExternalId ? byExternalId.get(current.parentExternalId) : undefined;
    }
    return true;
  });
  return {
    epics: 0,
    features: 0,
    planHours,
    actualHours: null,
    ...assignmentCounts(items, summary.visibleRoles, summary.rolePlan.byUnattached),
  };
}

function groupItems(summary: ProjectSummary) {
  const epics = summary.items.filter((item) => item.type.toLowerCase() === 'epic');
  const features = summary.items.filter((item) => item.type.toLowerCase() === 'feature');
  const byExternalId = new Map(summary.items.map((item) => [item.externalId, item]));
  const featuresByEpic = new Map<string, RoadmapWorkItem[]>();
  const standaloneFeatures: RoadmapWorkItem[] = [];
  for (const feature of features) {
    const visited = new Set([feature.externalId]);
    let ancestor = feature.parentExternalId ? byExternalId.get(feature.parentExternalId) : undefined;
    while (ancestor && ancestor.type.toLowerCase() !== 'epic' && !visited.has(ancestor.externalId)) {
      visited.add(ancestor.externalId);
      ancestor = ancestor.parentExternalId ? byExternalId.get(ancestor.parentExternalId) : undefined;
    }
    if (ancestor?.type.toLowerCase() === 'epic' && !visited.has(ancestor.externalId)) {
      featuresByEpic.set(ancestor.id, [...(featuresByEpic.get(ancestor.id) ?? []), feature]);
    } else standaloneFeatures.push(feature);
  }
  return { epics, featuresByEpic, standaloneFeatures };
}

/* Row geometry mirrors the project table: toggle 1.75rem, gap 0.5rem, icon 1rem. Epics sit one toggle deeper than
 * projects, and the feature tree line runs through the centre of the epic icon (80px, 84px from sm). */
const ROW_CLASS = {
  project: 'group/row align-top transition-colors bg-[color-mix(in_srgb,var(--color-muted)_30%,var(--color-card))] hover:bg-[color-mix(in_srgb,var(--color-muted)_45%,var(--color-card))] [&>*]:border-t [&>*]:border-t-border',
  epic: 'group/row align-top transition-colors bg-[color-mix(in_srgb,var(--color-muted)_12%,var(--color-card))] hover:bg-[color-mix(in_srgb,var(--color-muted)_25%,var(--color-card))] [&>*]:border-t [&>*]:border-t-border/60',
  feature: 'group/row align-top transition-colors bg-card hover:bg-[color-mix(in_srgb,var(--color-muted)_15%,var(--color-card))] [&>*]:border-t [&>*]:border-t-border/50',
} satisfies Record<RowLevel, string>;
const NESTED_NAME_CLASS = 'pl-[76px] pr-5 sm:pl-[80px]';

function ProjectPlanDetails({
  projectId, quarterKey, monthKey, plannedRolesOnly, includeChildEpics, showFact, refreshInterval, expandedEpics, onToggleEpic, pin, columns,
}: DetailPeriod & { projectId: string; expandedEpics: ReadonlySet<string>; onToggleEpic: (key: string) => void; pin: Pin; columns: number }) {
  const client = useQueryClient();
  const demoMode = isRoadmapDemoMode();
  const planQuery = useQuery({
    queryKey: roadmapPlanQueryKey(projectId, includeChildEpics),
    queryFn: () => roadmapApi.plan(projectId, includeChildEpics),
    placeholderData: (previous) => previous?.id === projectId ? previous : undefined,
    refetchInterval: refreshInterval,
    retry: false,
  });
  const plan = planQuery.isError ? undefined : planQuery.data;
  const factQuery = useQuery({
    queryKey: roadmapMonthlyFactQueryKey(projectId, monthKey ?? '', includeChildEpics),
    queryFn: ({ signal }) => getRoadmapMonthlyFact(projectId, monthKey ?? '', signal, includeChildEpics),
    enabled: Boolean(plan && monthKey && !demoMode),
    staleTime: 5 * 60 * 1000,
    refetchInterval: refreshInterval,
    retry: false,
  });
  const previousImport = useRef<string | null>(null);
  const syncedAt = plan?.syncedAt;
  useEffect(() => {
    if (!demoMode && previousImport.current && syncedAt && previousImport.current !== syncedAt) {
      void client.invalidateQueries({ queryKey: ['roadmap', 'monthly-fact', projectId] });
    }
    previousImport.current = syncedAt ?? null;
  }, [client, demoMode, projectId, syncedAt]);

  const monthlyFact = factQuery.data;
  const summary = useMemo(() => plan ? getRoadmapSummary(plan, {
    quarterKey, monthKey, monthlyFact, plannedRolesOnly, includeChildEpics,
  }) : undefined, [plan, quarterKey, monthKey, monthlyFact, plannedRolesOnly, includeChildEpics]);
  const messageRow = (content: ReactNode, className = 'px-4 py-3') => <tr className={ROW_CLASS.feature}>
    <td colSpan={columns} className={className}>{content}</td>
  </tr>;
  if (planQuery.isPending) return messageRow(<SkeletonStatus label="Загружаем детали проекта">
    {['w-1/2', 'w-2/5', 'w-1/3'].map((width, index) => <div key={index} className={cn('flex items-center gap-3 py-2.5', index && 'border-t border-border/50', NESTED_NAME_CLASS)}>
      <Skeleton className="size-3.5 shrink-0 rounded" />
      <Skeleton className={`h-3 ${width}`} />
      <Skeleton className="ml-auto h-3 w-10" />
    </div>)}
  </SkeletonStatus>, 'p-0');
  if (!summary) return messageRow(<QueryErrorNotice title="Не удалось загрузить детали проекта" queries={[planQuery]} />);

  const renderEpic = (item: RoadmapWorkItem, features: RoadmapWorkItem[]) => {
    const key = `${projectId}:${item.id}`;
    const expanded = expandedEpics.has(key);
    const featureCount = features.length;
    return <Fragment key={key}>
      <tr data-row-kind="epic" className={ROW_CLASS.epic}>
        <th scope="row" style={pin('name').style} className={cn('py-2 pl-[40px] pr-5 text-left font-normal sm:pl-[44px]', pin('name').className)}>
          <div className="-ml-1 grid grid-cols-[1.75rem_1rem_minmax(0,1fr)] items-start gap-x-2">
            {featureCount ? <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} эпик ${item.title}`}
              aria-expanded={expanded}
              data-plan-toggle
              onClick={() => onToggleEpic(key)}
              className="-mt-1 size-7 text-muted-foreground hover:text-foreground motion-reduce:transition-none"
            >{expanded ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}</Button> : <span aria-hidden="true" />}
            <AzureWorkItemIcon type={item.type} className="mt-0.5" />
            <div data-plan-name className="min-w-0">
              <p data-plan-title title={item.title} className="text-sm leading-5 font-medium text-foreground [overflow-wrap:anywhere]">{item.title}</p>
              <div data-plan-meta className="mt-1.5 grid grid-cols-[3.25rem_4.25rem_auto] items-center justify-start gap-x-1.5 gap-y-1.5 text-xs leading-4 text-muted-foreground">
                <span className="min-w-0 whitespace-nowrap tabular-nums" title={`Epic #${item.externalId}`}><span className="sr-only">Epic </span>#{item.externalId}</span>
                <WorkItemStateBadge state={item.state} className="w-full justify-center" />
                <span className="justify-self-start rounded-full px-2 py-px text-[10.5px] leading-4 whitespace-nowrap tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
                  {plural(featureCount, 'фича', 'фичи', 'фич')}
                </span>
              </div>
            </div>
          </div>
        </th>
        <Metrics summary={itemSummary(item, summary, includeChildEpics)} showFact={showFact} level="epic" pin={pin} />
      </tr>
      {expanded ? features.map((feature, index) => renderFeature(feature, true, index === features.length - 1)) : null}
    </Fragment>;
  };

  const renderFeature = (item: RoadmapWorkItem, child = false, last = false) => <tr key={`${projectId}:${item.id}`} data-row-kind="feature" className={ROW_CLASS.feature}>
    <th
      scope="row"
      style={pin('name').style}
      data-plan-connector={child ? '' : undefined}
      className={cn('py-2 text-left font-normal', pin('name').className, child
        ? cn('relative pl-0 pr-5 before:pointer-events-none before:absolute before:left-[80px] before:top-0 before:border-l before:border-border sm:before:left-[84px] after:pointer-events-none after:absolute after:left-[80px] after:top-[calc(var(--plan-pad-y)+10px)] after:w-3 after:border-t after:border-border sm:after:left-[84px]', last ? 'before:h-[calc(var(--plan-pad-y)+11px)]' : 'before:bottom-0')
        : NESTED_NAME_CLASS)}
    >
      <div data-plan-name className={child ? 'pl-[96px] sm:pl-[100px]' : undefined}>
        <div className="flex min-w-0 items-start gap-2">
          <AzureWorkItemIcon type={item.type} className="mt-0.5" />
          <span data-plan-title title={item.title} className="min-w-0 text-sm leading-snug text-foreground/90 [overflow-wrap:anywhere]">{item.title}</span>
        </div>
        <div data-plan-meta className="mt-1 grid grid-cols-[3.25rem_auto] items-center justify-start gap-x-1.5 gap-y-1 pl-6 text-[11px] text-muted-foreground">
          <span className="whitespace-nowrap tabular-nums" title={`Feature #${item.externalId}`}><span className="sr-only">Feature </span>#{item.externalId}</span>
          <WorkItemStateBadge state={item.state} variant="dot" className="justify-self-start" />
        </div>
      </div>
    </th>
    <Metrics summary={itemSummary(item, summary, includeChildEpics)} showFact={showFact} level="feature" pin={pin} />
  </tr>;

  const renderStandaloneGroup = (features: RoadmapWorkItem[]) => {
    const key = `${projectId}:standalone`;
    const expanded = expandedEpics.has(key);
    return <Fragment key={key}>
      <tr data-row-kind="epic" data-standalone-group className={ROW_CLASS.epic}>
        <th scope="row" style={pin('name').style} className={cn('py-2 pl-[40px] pr-5 text-left font-normal sm:pl-[44px]', pin('name').className)}>
          <div className="-ml-1 grid grid-cols-[1.75rem_1rem_minmax(0,1fr)] items-start gap-x-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} фичи без эпика`}
              aria-expanded={expanded}
              data-plan-toggle
              onClick={() => onToggleEpic(key)}
              className="-mt-1 size-7 text-muted-foreground hover:text-foreground motion-reduce:transition-none"
            >{expanded ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}</Button>
            <Layers aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
            <div data-plan-name className="min-w-0">
              <p data-plan-title className="text-sm leading-5 font-medium text-foreground">Фичи без эпика</p>
              <div data-plan-meta className="mt-1.5 text-xs leading-4 text-muted-foreground">
                <span className="rounded-full px-2 py-px text-[10.5px] leading-4 whitespace-nowrap tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
                  {plural(features.length, 'фича', 'фичи', 'фич')}
                </span>
              </div>
            </div>
          </div>
        </th>
        <Metrics summary={standaloneSummary(features, summary)} showFact={showFact} level="epic" pin={pin} />
      </tr>
      {expanded ? features.map((feature, index) => renderFeature(feature, true, index === features.length - 1)) : null}
    </Fragment>;
  };

  const groups = groupItems(summary);
  const unattachedPlanHours = [...summary.rolePlan.byUnattached.values()].reduce((sum, value) => sum + value, 0);
  return <>
    {factQuery.isError ? messageRow(<QueryErrorNotice title="Не удалось загрузить факт за месяц" queries={[factQuery]} />) : null}
    {groups.epics.map((epic) => renderEpic(epic, groups.featuresByEpic.get(epic.id) ?? []))}
    {groups.standaloneFeatures.length ? renderStandaloneGroup(groups.standaloneFeatures) : null}
    {unattachedPlanHours > 0 ? <tr data-row-kind="feature" className={ROW_CLASS.feature}>
      <th scope="row" style={pin('name').style} className={cn('py-2.5 text-left text-sm font-normal', NESTED_NAME_CLASS, pin('name').className)}>
        План без эпика / фичи
        <span className="mt-0.5 block text-xs text-muted-foreground">Назначения на карточках без связи с эпиком или фичей</span>
      </th>
      <Metrics summary={unattachedSummary(summary, unattachedPlanHours)} showFact={showFact} level="feature" pin={pin} />
    </tr> : null}
    {!groups.epics.length && !groups.standaloneFeatures.length && !unattachedPlanHours
      ? messageRow(<span className="text-sm text-muted-foreground">В проекте нет деталей за выбранный период.</span>, cn('py-3', NESTED_NAME_CLASS))
      : null}
  </>;
}

function SortHeader({ column, sort, onSort, pin }: { column: ColumnDef; sort: SortState; onSort: (key: SortKey) => void; pin: Pin }) {
  const active = sort?.key === column.id;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const name = column.id === 'name';
  return <th
    scope="col"
    data-column-id={column.id}
    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
    title={column.title}
    style={pin(column.id).style}
    className={cn('relative px-3 py-2.5 align-bottom', name ? 'pr-5 text-left @lg:px-4 @lg:pr-5' : 'border-l border-border/60 text-right', pin(column.id).className)}
  >
    <button
      type="button"
      onClick={() => onSort(column.id)}
      aria-label={`${column.label === 'Δ' ? 'Дельта' : column.label}: сортировать`}
      className={cn('inline-flex max-w-full items-end gap-1 rounded-sm uppercase tracking-wide hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', !name && 'flex-row-reverse text-right', active && 'text-foreground')}
    >
      <span className="min-w-0">
        <span className="block truncate">{column.label}</span>
        {column.unit ? <span className="block truncate text-[10px] font-normal normal-case tracking-normal">{column.unit}</span> : null}
      </span>
      <Icon aria-hidden="true" className={cn('mb-px size-3 shrink-0', !active && 'opacity-40')} />
    </button>
    <ColumnResizeHandle columnId={column.id} />
  </th>;
}

export function AllProjectsPlanTable({
  projects, summaries, loading, onSelectProject, columnWidths, pinnedColumns, filters, period: periodControls, actions, notices, ...period
}: DetailPeriod & {
  projects: ImportedProject[];
  summaries?: Record<string, RoadmapProjectOverview>;
  loading: boolean;
  onSelectProject: (projectId: string) => void;
  columnWidths: ColumnWidthsApi;
  pinnedColumns: RoadmapTablePreferences['pinnedColumns'];
  /** Toolbar slots: filters after the search, period and actions on the right, notices under the toolbar. */
  filters?: ReactNode;
  period?: ReactNode;
  actions?: ReactNode;
  notices?: ReactNode;
}) {
  const { monthKey, showFact } = period;
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [requestedSort, setRequestedSort] = useState<SortState>(null);
  const [viewRestored, setViewRestored] = useState(false);

  // Restored after mount so the server-rendered markup matches the first client render.
  useEffect(() => {
    const stored = readStoredView();
    if (stored.projects) setExpandedProjects(new Set(stored.projects));
    if (stored.epics) setExpandedEpics(new Set(stored.epics));
    if (stored.sort) setRequestedSort(stored.sort);
    setViewRestored(true);
  }, []);

  useEffect(() => {
    // Wait for the catalog: an empty list while loading must not erase the saved view.
    if (!viewRestored || !projects.length) return;
    const projectIds = new Set(projects.map((project) => project.id));
    const epicPrefixes = projects.map((project) => `${project.roadmapId}:`);
    writeStoredView({
      projects: [...expandedProjects].filter((id) => projectIds.has(id)),
      epics: [...expandedEpics].filter((key) => epicPrefixes.some((prefix) => key.startsWith(prefix))),
      sort: requestedSort,
    });
  }, [viewRestored, projects, expandedProjects, expandedEpics, requestedSort]);
  const sort = requestedSort && (showFact || !FACT_SORT_KEYS.includes(requestedSort.key)) ? requestedSort : null;
  const onSort = (key: SortKey) => setRequestedSort(nextSort(sort, key));

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = projects.map((project, index) => ({ project, index }))
      .filter(({ project }) => !needle || project.name.toLowerCase().includes(needle));
    if (sort) {
      rows.sort((a, b) => {
        const left = sortValue(sort.key, a.project, summaries?.[a.project.roadmapId]);
        const right = sortValue(sort.key, b.project, summaries?.[b.project.roadmapId]);
        if (left === null || right === null) return left === right ? a.index - b.index : left === null ? 1 : -1;
        const diff = typeof left === 'string' || typeof right === 'string'
          ? String(left).localeCompare(String(right), 'ru')
          : left - right;
        return (sort.dir === 'asc' ? diff : -diff) || a.index - b.index;
      });
    }
    return rows.map(({ project }) => project);
  }, [projects, summaries, query, sort]);

  const expandableProjects = visibleProjects.filter((project) => summaries?.[project.roadmapId]?.canExpand);
  const allExpanded = expandableProjects.length > 0 && expandableProjects.every((project) => expandedProjects.has(project.id));
  const anyExpanded = expandedProjects.size > 0 || expandedEpics.size > 0;

  const defs = columnDefs(showFact, monthKey);
  const tableColumns: (PlanColumn & ColumnWidthConfig)[] = defs.map(({ id, label, sizing }) => ({
    ...sizing, id, label, width: columnWidths.getWidth(widthKey(id), sizing), customized: columnWidths.hasCustomWidth(widthKey(id)),
  }));
  const pinnedColumnIds: SortKey[] = pinnedColumns === 'none' ? [] : pinnedColumns === 'name' ? ['name'] : ['name', 'plan', ...(showFact ? ['fact'] as SortKey[] : [])];
  const lastPinned = pinnedColumnIds[pinnedColumnIds.length - 1];
  /** Same pinning as the project table: the name from md, the totals too once the table is wide enough. */
  const pin: Pin = (id) => {
    if (!pinnedColumnIds.includes(id)) return {};
    const edge = 'shadow-[1px_0_0_var(--color-border),5px_0_6px_-5px_rgb(0_0_0/0.18)]';
    const style = { '--roadmap-pinned-left': planColumnOffset(pinnedColumnIds.slice(0, pinnedColumnIds.indexOf(id))) } as CSSProperties;
    if (id === 'name') return { style, className: cn('md:sticky md:left-[var(--roadmap-pinned-left)] md:z-10 md:bg-inherit', `md:${edge}`, pinnedColumns === 'totals' && '@2xl:shadow-none') };
    return { style, className: cn('@2xl:sticky @2xl:left-[var(--roadmap-pinned-left)] @2xl:z-10 @2xl:bg-inherit', id === lastPinned && `@2xl:${edge}`) };
  };

  /** Exports the projects as they are shown now: filtered, sorted, with the selected period. */
  const exportCsv = () => {
    const header = ['Проект', 'План, ч', ...(showFact ? ['Факт, ч', 'Выполнено, %', 'Дельта, ч'] : []), 'Эпики', 'Фичи', 'Роли', 'Участники'];
    const rows = visibleProjects.map((project) => {
      const metrics = summaries?.[project.roadmapId]?.metrics;
      return [
        project.name, metrics?.planHours ?? null,
        ...(showFact ? [metrics?.actualHours ?? null, donePercent(metrics), deltaOf(metrics)] : []),
        metrics?.epics ?? null, metrics?.features ?? null, metrics?.roles ?? null, metrics?.participants ?? null,
      ];
    });
    downloadCsv(`plan-projects-${period.quarterKey}${monthKey ? `-${monthKey}` : ''}.csv`, [header, ...rows]);
  };

  /** Arrow keys walk the expand buttons: Up/Down between rows, Right opens, Left closes. */
  const onToggleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.hasAttribute('aria-expanded') || event.altKey || event.ctrlKey || event.metaKey) return;
    const toggles = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('tbody button[aria-expanded]:not(:disabled)'));
    const index = toggles.indexOf(target);
    const moveTo = (next: number) => { event.preventDefault(); toggles[next]?.focus(); };
    if (event.key === 'ArrowDown') moveTo(Math.min(index + 1, toggles.length - 1));
    else if (event.key === 'ArrowUp') moveTo(Math.max(index - 1, 0));
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(toggles.length - 1);
    else if ((event.key === 'ArrowRight' && target.getAttribute('aria-expanded') === 'false') || (event.key === 'ArrowLeft' && target.getAttribute('aria-expanded') === 'true')) {
      event.preventDefault();
      target.click();
    }
  };

  const segmentButton = 'h-full w-8 rounded-none text-muted-foreground hover:bg-muted/60 hover:text-foreground';
  const emptyRow = (message: ReactNode) => <tbody><tr><td colSpan={defs.length} className="px-4 py-10 text-center text-sm text-muted-foreground">{message}</td></tr></tbody>;

  return <>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="relative w-full min-w-0 sm:w-60">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Найти проект" placeholder="Найти проект…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        {filters}
        <p role="status" className="px-1 text-xs text-muted-foreground">{query.trim() ? `Найдено: ${visibleProjects.length} из ${projects.length}` : null}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {periodControls}
        <div role="group" aria-label="Строки таблицы" className="flex h-8 items-stretch divide-x divide-border overflow-visible rounded-md border border-border bg-card shadow-xs">
          <IconButton variant="ghost" label="Развернуть все проекты" icon={<ChevronsUpDown aria-hidden="true" />} wrapperClassName="self-stretch" className={cn(segmentButton, 'rounded-l-[5px]')}
            disabled={!expandableProjects.length || allExpanded}
            onClick={() => setExpandedProjects((current) => new Set([...current, ...expandableProjects.map((project) => project.id)]))} />
          <IconButton variant="ghost" label="Свернуть всё" icon={<ChevronsDownUp aria-hidden="true" />} wrapperClassName="self-stretch" className={cn(segmentButton, 'rounded-r-[5px]')}
            disabled={!anyExpanded}
            onClick={() => { setExpandedProjects(new Set()); setExpandedEpics(new Set()); }} />
        </div>
        <IconButton label="Экспорт в CSV" tooltip="Скачать CSV с проектами, которые сейчас показаны" icon={<Download aria-hidden="true" />} align="end"
          disabled={!visibleProjects.length || !summaries} onClick={exportCsv} />
        {actions}
      </div>
    </div>
    {notices}
    <div
      role="region"
      aria-label="Таблица плана и факта по проектам"
      tabIndex={0}
      className="@container roadmap-scrollbar relative max-h-[calc(100dvh-7rem)] min-w-0 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      onKeyDown={onToggleKeyDown}
    >
      <ResizablePlanTable
        columns={tableColumns}
        pinnedColumnIds={pinnedColumnIds}
        onColumnResize={(id, width) => columnWidths.commitWidth(widthKey(id), width, tableColumns.find((column) => column.id === id)!)}
        className="roadmap-plan-table table-fixed border-separate border-spacing-0 text-left [&>thead>tr>th]:border-b [&>thead>tr>th]:border-b-border [&>tbody:first-of-type>tr:first-child>*]:border-t-0"
      >
        <caption className="sr-only">Сводный план проектов. Раскройте проект, затем эпик, чтобы увидеть фичи. Заголовки столбцов сортируют проекты.</caption>
        <thead className="sticky top-0 z-20 bg-card [&_th]:isolate">
          <tr className="bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] text-[11px] font-semibold text-muted-foreground">
            {defs.map((column) => <SortHeader key={column.id} column={column} sort={sort} onSort={onSort} pin={pin} />)}
          </tr>
        </thead>
        {visibleProjects.map((project) => {
          const summary = summaries?.[project.roadmapId];
          const expanded = expandedProjects.has(project.id);
          return <tbody key={project.id}>
            <tr data-row-kind="project" className={ROW_CLASS.project}>
              <th scope="row" style={pin('name').style} className={cn('py-2 pl-3 pr-3 text-left font-normal inset-shadow-[2px_0_0] inset-shadow-primary/40 sm:pl-4', pin('name').className)}>
                <div className="-ml-1 grid grid-cols-[1.75rem_1rem_minmax(0,1fr)_2rem] items-start gap-x-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} проект ${project.name}`}
                    aria-expanded={expanded}
                    disabled={!expanded && !summary?.canExpand}
                    data-plan-toggle
                    onClick={() => setExpandedProjects((current) => toggle(current, project.id))}
                    className="-mt-1 size-7 text-muted-foreground hover:text-foreground motion-reduce:transition-none"
                  >{expanded ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}</Button>
                  <FolderOpen aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                  <div data-plan-name className="min-w-0">
                    <button
                      type="button"
                      data-plan-title
                      title={`${project.name} — открыть план`}
                      onClick={() => onSelectProject(project.id)}
                      className="block w-full rounded-sm text-left text-sm leading-5 font-semibold text-foreground underline-offset-2 [overflow-wrap:anywhere] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >{project.name}</button>
                    {summary ? null : loading ? <Skeleton className="mt-1.5 h-2.5 w-24" /> : <p data-plan-meta className="mt-1 text-xs text-muted-foreground">Сводка недоступна</p>}
                  </div>
                  <IconButton
                    variant="ghost"
                    label={`Открыть план проекта ${project.name}`}
                    tooltip="Открыть план проекта"
                    icon={<ArrowUpRight aria-hidden="true" />}
                    side="left"
                    data-plan-action
                    wrapperClassName="-mt-0.5 self-start"
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                    onClick={() => onSelectProject(project.id)}
                  />
                </div>
              </th>
              <Metrics summary={summary?.metrics} showFact={showFact} loading={loading} level="project" pin={pin} />
            </tr>
            {expanded && summary ? <ProjectPlanDetails
              {...period}
              projectId={project.roadmapId}
              expandedEpics={expandedEpics}
              onToggleEpic={(key) => setExpandedEpics((current) => toggle(current, key))}
              pin={pin}
              columns={defs.length}
            /> : null}
          </tbody>;
        })}
        {!projects.length ? emptyRow('Нет загруженных проектов. Выберите проект в списке выше, чтобы открыть или загрузить его план.') : null}
        {projects.length && !visibleProjects.length ? emptyRow(<>Ничего не найдено по запросу «{query.trim()}».</>) : null}
      </ResizablePlanTable>
    </div>
  </>;
}
