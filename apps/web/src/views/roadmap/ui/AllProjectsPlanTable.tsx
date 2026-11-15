'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRoadmapSummary, type RoadmapProjectOverview, type RoadmapSummary, type RoadmapSummaryMetrics } from '@tracker/shared';
import { ArrowUpRight, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { getRoadmapMonthlyFact, roadmapApi, type AzureProject, type RoadmapRole, type RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { cn } from '@/shared/lib/utils';

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

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const metricClass = 'whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums';

function hours(value: number | null) {
  return value === null ? '—' : `${numberFormat.format(value)} ч`;
}

function Metrics({ summary, showFact = true }: { summary?: RoadmapSummaryMetrics; showFact?: boolean }) {
  return <>
    <td className={cn(metricClass, 'text-muted-foreground')}>{summary ? numberFormat.format(summary.epics) : '—'}</td>
    <td className={cn(metricClass, 'text-muted-foreground')}>{summary ? numberFormat.format(summary.features) : '—'}</td>
    <td className={cn(metricClass, 'font-medium text-foreground')}>{summary ? hours(summary.planHours) : '—'}</td>
    {showFact ? <td className={cn(metricClass, summary?.actualHours ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>{summary ? hours(summary.actualHours) : '—'}</td> : null}
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
  const columns = showFact ? 7 : 6;
  if (planQuery.isPending) return <tr><td colSpan={columns} className="px-4 py-3 text-sm text-muted-foreground" role="status">Загружаем детали проекта…</td></tr>;
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
              <p className="mt-1 text-xs text-muted-foreground">{epic ? 'Epic' : 'Feature'} #{item.externalId}{item.state ? ` · ${item.state}` : ''}</p>
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

  return <div className="roadmap-scrollbar min-w-0 overflow-x-auto">
    <table className="roadmap-plan-table w-full min-w-[880px] table-fixed border-collapse text-left">
      <caption className="sr-only">Сводный план проектов. Раскройте проект, затем эпик, чтобы увидеть фичи.</caption>
      <colgroup>
        <col className={showFact ? 'w-[40%]' : 'w-[52%]'} />
        <col className="w-[8%]" />
        <col className="w-[8%]" />
        <col className="w-[12%]" />
        {showFact ? <col className="w-[12%]" /> : null}
        <col className="w-[8%]" />
        <col className="w-[12%]" />
      </colgroup>
      <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
        <tr>
          <th scope="col" className="px-4 py-3 font-medium">Проект / эпик / фича</th>
          <th scope="col" className="px-3 py-3 text-right font-medium">Эпики</th>
          <th scope="col" className="px-3 py-3 text-right font-medium">Фичи</th>
          <th scope="col" className="px-3 py-3 text-right font-medium">План</th>
          {showFact ? <th scope="col" className="px-3 py-3 text-right font-medium" title={monthKey ? 'Факт за выбранный месяц' : 'Накопленный факт за всё время'}>Факт{!monthKey ? ' всего' : ''}</th> : null}
          <th scope="col" className="px-3 py-3 text-right font-medium">Роли</th>
          <th scope="col" className="px-3 py-3 text-right font-medium">Участники</th>
        </tr>
      </thead>
      {projects.map((project) => {
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
                    : <p className="mt-1 text-xs text-muted-foreground">{loading ? 'Загружаем сводку…' : 'Сводка недоступна'}</p>}
                </div>
              </div>
            </th>
            <Metrics summary={summary?.metrics} showFact={showFact} />
          </tr>
          {expanded && summary ? <ProjectPlanDetails
            {...period}
            projectId={project.roadmapId}
            expandedEpics={expandedEpics}
            onToggleEpic={(key) => setExpandedEpics((current) => toggle(current, key))}
          /> : null}
        </tbody>;
      })}
      {!projects.length ? <tbody><tr><td colSpan={showFact ? 7 : 6} className="px-4 py-8 text-center text-sm text-muted-foreground">Нет загруженных проектов. Выберите проект в списке выше, чтобы открыть или загрузить его план.</td></tr></tbody> : null}
    </table>
  </div>;
}
