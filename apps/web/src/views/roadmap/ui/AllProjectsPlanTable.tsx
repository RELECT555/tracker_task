'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRoadmapSummary, type RoadmapProjectOverview, type RoadmapSummary, type RoadmapSummaryMetrics } from '@tracker/shared';
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FolderOpen, Search } from 'lucide-react';
import { getRoadmapMonthlyFact, roadmapApi, type AzureProject, type RoadmapRole, type RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { WorkItemStateBadge } from '@/entities/roadmap/ui/WorkItemStateBadge';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { downloadCsv } from '../model/roadmap-csv';

type ProjectSummary = RoadmapSummary<RoadmapWorkItem, RoadmapRole>;

type ImportedProject = AzureProject & { roadmapId: string };

type DetailPeriod = {
  quarterKey: string;
  monthKey?: string;
  plannedRolesOnly: boolean;
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

function columnCount(showFact: boolean) {
  return showFact ? 9 : 6;
}

function SortHeader({ label, sortKey, sort, onSort, className, title }: {
  label: React.ReactNode; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void; className?: string; title?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={cn('font-medium', className)}>
    <button
      type="button"
      title={title}
      onClick={() => onSort(sortKey)}
      className={cn('inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring', active && 'text-foreground')}
    >{label}<Icon aria-hidden="true" className={cn('size-3 shrink-0', !active && 'opacity-40')} /></button>
  </th>;
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const metricClass = 'whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums';

function hours(value: number | null) {
  return value === null ? '—' : `${numberFormat.format(value)} ч`;
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

function formatDelta(delta: number) {
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${hours(Math.abs(delta))}`;
}

function Metrics({ summary, showFact = true, loading = false }: { summary?: RoadmapSummaryMetrics; showFact?: boolean; loading?: boolean }) {
  if (!summary && loading) {
    return <>{Array.from({ length: showFact ? 8 : 5 }, (_, index) => <td key={index} className={metricClass}><Skeleton className="ml-auto h-3 w-8" /></td>)}</>;
  }
  const percent = donePercent(summary);
  const delta = deltaOf(summary);
  return <>
    <td className={cn(metricClass, 'text-muted-foreground')}>{summary ? numberFormat.format(summary.epics) : '—'}</td>
    <td className={cn(metricClass, 'text-muted-foreground')}>{summary ? numberFormat.format(summary.features) : '—'}</td>
    <td className={cn(metricClass, 'font-medium text-foreground')}>{summary ? hours(summary.planHours) : '—'}</td>
    {showFact ? <>
      <td className={cn(metricClass, summary?.actualHours ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>{summary ? hours(summary.actualHours) : '—'}</td>
      <td className={metricClass}>{percent === null ? <span className="text-muted-foreground">—</span> : <span className="inline-flex items-center justify-end gap-2" title={`Факт — ${percent}% от плана`}>
        <span aria-hidden="true" className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', percent > 100 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(percent, 100)}%` }} />
        </span>
        <span className={cn('w-10 text-right', percent > 100 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-foreground')}>{percent}%</span>
      </span>}</td>
      <td title="Дельта = факт − план" className={cn(metricClass, delta !== null && delta > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>{delta === null ? '—' : formatDelta(delta)}</td>
    </> : null}
    <td className={cn(metricClass, 'text-muted-foreground')}>{summary ? numberFormat.format(summary.roles) : '—'}</td>
    <td className={cn(metricClass, 'text-muted-foreground')}>{summary ? numberFormat.format(summary.participants) : '—'}</td>
  </>;
}

/** Include descendants through intermediate Azure cards, without rendering those cards twice. */
function descendantItems(item: RoadmapWorkItem, items: RoadmapWorkItem[]) {
  const byExternalId = new Map(items.map((entry) => [entry.externalId, entry]));
  return items.filter((entry) => {
    let current: RoadmapWorkItem | undefined = entry;
    const visited = new Set<string>();
    while (current && !visited.has(current.externalId)) {
      if (current.id === item.id) return true;
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

function itemSummary(item: RoadmapWorkItem, summary: ProjectSummary) {
  const items = descendantItems(item, summary.items);
  const byRole = summary.rolePlan.byItem.get(item.id);
  return {
    epics: items.filter((entry) => entry.type.toLowerCase() === 'epic').length,
    features: items.filter((entry) => entry.type.toLowerCase() === 'feature').length,
    planHours: [...(byRole?.values() ?? [])].reduce((sum, value) => sum + value, 0),
    actualHours: item.actualHours === null ? null : Number(item.actualHours),
    ...assignmentCounts(items, summary.visibleRoles, byRole),
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

function ProjectPlanDetails({
  projectId, quarterKey, monthKey, plannedRolesOnly, showFact, refreshInterval, expandedEpics, onToggleEpic,
}: DetailPeriod & { projectId: string; expandedEpics: ReadonlySet<string>; onToggleEpic: (key: string) => void }) {
  const client = useQueryClient();
  const demoMode = isRoadmapDemoMode();
  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', projectId],
    queryFn: () => roadmapApi.plan(projectId),
    refetchInterval: refreshInterval,
    retry: false,
  });
  const plan = planQuery.isError ? undefined : planQuery.data;
  const factQuery = useQuery({
    queryKey: ['roadmap', 'monthly-fact', projectId, monthKey ?? ''],
    queryFn: ({ signal }) => getRoadmapMonthlyFact(projectId, monthKey ?? '', signal),
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
    quarterKey, monthKey, monthlyFact, plannedRolesOnly,
  }) : undefined, [plan, quarterKey, monthKey, monthlyFact, plannedRolesOnly]);
  const columns = columnCount(showFact);
  if (planQuery.isPending) return <tr><td colSpan={columns} className="p-0">
    <SkeletonStatus label="Загружаем детали проекта">
      {['w-1/2', 'w-2/5', 'w-1/3'].map((width, index) => <div key={index} className="flex items-center gap-3 border-t border-border/60 py-3 pl-12 pr-4">
        <Skeleton className="size-3.5 shrink-0 rounded" />
        <Skeleton className={`h-3 ${width}`} />
        <Skeleton className="ml-auto h-3 w-10" />
      </div>)}
    </SkeletonStatus>
  </td></tr>;
  if (!summary) return <tr><td colSpan={columns} className="px-4 py-3">
    <QueryErrorNotice title="Не удалось загрузить детали проекта" queries={[planQuery]} />
  </td></tr>;

  const renderItem = (item: RoadmapWorkItem, summary: ProjectSummary, child = false, features: RoadmapWorkItem[] = []) => {
    const epic = item.type.toLowerCase() === 'epic';
    const key = `${projectId}:${item.id}`;
    const expanded = expandedEpics.has(key);
    const ExpandIcon = expanded ? ChevronDown : ChevronRight;
    return <Fragment key={key}>
      <tr data-row-kind={epic ? 'epic' : 'feature'} className={cn('border-b border-border/60 last:border-b-0', epic ? 'bg-muted/20' : 'bg-card')}>
        <th scope="row" className={cn('px-4 py-2.5 text-left font-normal', child ? 'pl-16' : 'pl-9')}>
          <div className="flex items-start gap-2">
            {epic && features.length > 0 ? <button
              type="button"
              aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} эпик ${item.title}`}
              aria-expanded={expanded}
              onClick={() => onToggleEpic(key)}
              className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            ><ExpandIcon aria-hidden="true" className="size-4" /></button> : <span aria-hidden="true" className="size-6 shrink-0" />}
            <AzureWorkItemIcon type={item.type} className="mt-1 shrink-0" />
            <div className="min-w-0">
              <p data-plan-title title={item.title} className={cn('break-words text-sm leading-snug [overflow-wrap:anywhere]', epic && 'font-medium')}>{item.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{epic ? 'Epic' : 'Feature'} #{item.externalId}</span>
                <WorkItemStateBadge state={item.state} />
              </div>
            </div>
          </div>
        </th>
        <Metrics summary={itemSummary(item, summary)} showFact={showFact} />
      </tr>
      {epic && expanded ? features.map((feature) => renderItem(feature, summary, true)) : null}
    </Fragment>;
  };

  const groups = groupItems(summary);
  const unattachedPlanHours = [...summary.rolePlan.byUnattached.values()].reduce((sum, value) => sum + value, 0);
  return <>
    {factQuery.isError ? <tr><td colSpan={columns} className="px-4 py-3">
      <QueryErrorNotice title="Не удалось загрузить факт за месяц" queries={[factQuery]} />
    </td></tr> : null}
    {groups.epics.map((epic) => renderItem(epic, summary, false, groups.featuresByEpic.get(epic.id) ?? []))}
    {groups.standaloneFeatures.map((feature) => renderItem(feature, summary))}
    {unattachedPlanHours > 0 ? <tr className="border-b border-border/60 bg-card last:border-b-0">
      <th scope="row" className="px-4 py-3 pl-9 text-left font-normal">
        План без эпика / фичи
        <span className="mt-1 block text-xs text-muted-foreground">Назначения на карточках без связи с эпиком или фичей</span>
      </th>
      <Metrics summary={unattachedSummary(summary, unattachedPlanHours)} showFact={showFact} />
    </tr> : null}
    {!groups.epics.length && !groups.standaloneFeatures.length && !unattachedPlanHours
      ? <tr><td colSpan={columns} className="px-4 py-3 text-sm text-muted-foreground">В проекте нет деталей за выбранный период.</td></tr>
      : null}
  </>;
}

export function AllProjectsPlanTable({
  projects, summaries, loading, onSelectProject, ...period
}: DetailPeriod & {
  projects: ImportedProject[];
  summaries?: Record<string, RoadmapProjectOverview>;
  loading: boolean;
  onSelectProject: (projectId: string) => void;
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
  const columns = columnCount(showFact);

  /** Exports the projects as they are shown now: filtered, sorted, with the selected period. */
  const exportCsv = () => {
    const header = ['Проект', 'Эпики', 'Фичи', 'План, ч', ...(showFact ? ['Факт, ч', 'Выполнено, %', 'Дельта, ч'] : []), 'Роли', 'Участники'];
    const rows = visibleProjects.map((project) => {
      const metrics = summaries?.[project.roadmapId]?.metrics;
      return [
        project.name, metrics?.epics ?? null, metrics?.features ?? null, metrics?.planHours ?? null,
        ...(showFact ? [metrics?.actualHours ?? null, donePercent(metrics), deltaOf(metrics)] : []),
        metrics?.roles ?? null, metrics?.participants ?? null,
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

  return <>
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Найти проект" placeholder="Найти проект…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 text-xs" />
      </div>
      <p role="status" className="text-xs text-muted-foreground">{query.trim() ? `Найдено проектов: ${visibleProjects.length} из ${projects.length}` : null}</p>
      <div className="ml-auto flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" disabled={!expandableProjects.length || allExpanded}
          onClick={() => setExpandedProjects((current) => new Set([...current, ...expandableProjects.map((project) => project.id)]))}
        ><ChevronsUpDown aria-hidden="true" className="size-3.5" />Развернуть проекты</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" disabled={!anyExpanded}
          onClick={() => { setExpandedProjects(new Set()); setExpandedEpics(new Set()); }}
        ><ChevronsDownUp aria-hidden="true" className="size-3.5" />Свернуть всё</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" disabled={!visibleProjects.length || !summaries} onClick={exportCsv}
          title="Скачать CSV с проектами, которые сейчас показаны"
        ><Download aria-hidden="true" className="size-3.5" />Экспорт CSV</Button>
      </div>
    </div>
    <div className="roadmap-scrollbar max-h-[70vh] min-w-0 overflow-auto" onKeyDown={onToggleKeyDown}>
    <table className={cn('roadmap-plan-table w-full table-fixed border-collapse text-left', showFact ? 'min-w-[1100px]' : 'min-w-[880px]')}>
      <caption className="sr-only">Сводный план проектов. Раскройте проект, затем эпик, чтобы увидеть фичи. Заголовки столбцов сортируют проекты.</caption>
      <colgroup>
        {showFact ? <>
          <col className="w-[26%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
        </> : <>
          <col className="w-[52%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[12%]" />
        </>}
      </colgroup>
      <thead className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--color-muted)_50%,var(--color-card))] text-xs font-medium text-muted-foreground shadow-[0_1px_0_var(--color-border)]">
        <tr>
          <SortHeader label="Проект / эпик / фича" sortKey="name" sort={sort} onSort={onSort} className="px-4 py-3" />
          <SortHeader label="Эпики" sortKey="epics" sort={sort} onSort={onSort} className="px-3 py-3 text-right" />
          <SortHeader label="Фичи" sortKey="features" sort={sort} onSort={onSort} className="px-3 py-3 text-right" />
          <SortHeader label="План" sortKey="plan" sort={sort} onSort={onSort} className="px-3 py-3 text-right" />
          {showFact ? <>
            <SortHeader label={<>Факт{!monthKey ? ' всего' : ''}</>} sortKey="fact" sort={sort} onSort={onSort} className="px-3 py-3 text-right" title={monthKey ? 'Факт за выбранный месяц' : 'Накопленный факт за всё время'} />
            <SortHeader label="Выполнено" sortKey="done" sort={sort} onSort={onSort} className="px-3 py-3 text-right" title="Факт в процентах от плана" />
            <SortHeader label="Дельта" sortKey="delta" sort={sort} onSort={onSort} className="px-3 py-3 text-right" title="Факт − план: плюс означает перерасход" />
          </> : null}
          <SortHeader label="Роли" sortKey="roles" sort={sort} onSort={onSort} className="px-3 py-3 text-right" />
          <SortHeader label="Участники" sortKey="participants" sort={sort} onSort={onSort} className="px-3 py-3 text-right" />
        </tr>
      </thead>
      {visibleProjects.map((project) => {
        const summary = summaries?.[project.roadmapId];
        const expanded = expandedProjects.has(project.id);
        const ExpandIcon = expanded ? ChevronDown : ChevronRight;
        return <tbody key={project.id} className="border-b border-border last:border-b-0">
          <tr data-row-kind="project" className="bg-muted/30">
            <th scope="row" className="px-4 py-3 text-left font-normal">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} проект ${project.name}`}
                  aria-expanded={expanded}
                  disabled={!expanded && !summary?.canExpand}
                  onClick={() => setExpandedProjects((current) => toggle(current, project.id))}
                  className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-30"
                ><ExpandIcon aria-hidden="true" className="size-4" /></button>
                <FolderOpen aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p data-plan-title title={project.name} className="break-words text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{project.name}</p>
                  {summary ? <button type="button" onClick={() => onSelectProject(project.id)} aria-label={`Открыть план проекта ${project.name}`} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Открыть план<ArrowUpRight aria-hidden="true" className="size-3" /></button>
                    : loading ? <Skeleton className="mt-2 h-2.5 w-24" /> : <p className="mt-1 text-xs text-muted-foreground">Сводка недоступна</p>}
                </div>
              </div>
            </th>
            <Metrics summary={summary?.metrics} showFact={showFact} loading={loading} />
          </tr>
          {expanded && summary ? <ProjectPlanDetails
            {...period}
            projectId={project.roadmapId}
            expandedEpics={expandedEpics}
            onToggleEpic={(key) => setExpandedEpics((current) => toggle(current, key))}
          /> : null}
        </tbody>;
      })}
      {!projects.length ? <tbody><tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-muted-foreground">Нет загруженных проектов. Выберите проект в списке выше, чтобы открыть или загрузить его план.</td></tr></tbody> : null}
      {projects.length && !visibleProjects.length ? <tbody><tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-muted-foreground">Ничего не найдено по запросу «{query.trim()}».</td></tr></tbody> : null}
    </table>
    </div>
  </>;
}
