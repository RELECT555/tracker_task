'use client';

import { Fragment, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, FolderOpen, RefreshCw } from 'lucide-react';
import type { AzureProject, RoadmapProjectPlan, RoadmapRole, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import type { RoadmapSummary, RoadmapSummaryTotals } from '../model/roadmap-summary';

export interface AllProjectsPlanEntry {
  project: AzureProject;
  plan?: RoadmapProjectPlan;
  summary?: RoadmapSummary;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const metricClass = 'whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums';

function hours(value: number | null) {
  return value === null ? '—' : `${numberFormat.format(value)} ч`;
}

function Metrics({ summary, showFact = true }: { summary?: Pick<RoadmapSummaryTotals, 'epics' | 'features' | 'planHours' | 'actualHours' | 'roles' | 'participants'>; showFact?: boolean }) {
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

function itemSummary(item: RoadmapWorkItem, summary: RoadmapSummary) {
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

function unattachedSummary(summary: RoadmapSummary, planHours: number) {
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

function groupItems(summary: RoadmapSummary) {
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

export function AllProjectsPlanTable({ projects, onSelectProject, monthKey, showFact = true }: {
  projects: AllProjectsPlanEntry[];
  onSelectProject: (projectId: string) => void;
  monthKey?: string;
  showFact?: boolean;
}) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(() => new Set());
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const renderItem = (projectId: string, item: RoadmapWorkItem, summary: RoadmapSummary, child = false, features: RoadmapWorkItem[] = []) => {
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
              onClick={() => setExpandedEpics((current) => toggle(current, key))}
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
      {epic && expanded ? features.map((feature) => renderItem(projectId, feature, summary, true)) : null}
    </Fragment>;
  };

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
      {projects.map(({ project, summary, loading, error, onRetry }) => {
        const expanded = expandedProjects.has(project.id);
        const ExpandIcon = expanded ? ChevronDown : ChevronRight;
        const unattachedPlanHours = [...(summary?.rolePlan.byUnattached.values() ?? [])].reduce((sum, value) => sum + value, 0);
        const canExpand = Boolean(summary && (summary.epics || summary.features || unattachedPlanHours > 0));
        const groups = expanded && summary ? groupItems(summary) : undefined;
        return <tbody key={project.id} className="border-b border-border last:border-b-0">
          <tr data-row-kind="project" className="bg-muted/30">
            <th scope="row" className="px-4 py-3 text-left font-normal">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} проект ${project.name}`}
                  aria-expanded={expanded}
                  disabled={!canExpand}
                  onClick={() => setExpandedProjects((current) => toggle(current, project.id))}
                  className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-30"
                ><ExpandIcon aria-hidden="true" className="size-4" /></button>
                <FolderOpen aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p data-plan-title title={project.name} className="break-words text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{project.name}</p>
                  {loading ? <p role="status" className="mt-1 text-xs text-muted-foreground">Загружаем план…</p>
                    : error ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="text-destructive">Не удалось загрузить данные</span>
                      <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="h-7 gap-1 px-1.5 text-xs"><RefreshCw aria-hidden="true" className="size-3" />Повторить</Button>
                    </div>
                      : <button type="button" onClick={() => onSelectProject(project.id)} aria-label={`Открыть план проекта ${project.name}`} className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">Открыть план<ArrowUpRight aria-hidden="true" className="size-3" /></button>}
                </div>
              </div>
            </th>
            <Metrics summary={summary} showFact={showFact} />
          </tr>
          {groups && summary ? <>
            {groups.epics.map((epic) => renderItem(project.id, epic, summary, false, groups.featuresByEpic.get(epic.id) ?? []))}
            {groups.standaloneFeatures.map((feature) => renderItem(project.id, feature, summary))}
            {unattachedPlanHours > 0 ? <tr className="border-b border-border/60 bg-card last:border-b-0">
              <th scope="row" className="py-3 pl-9 pr-4 text-left text-sm font-medium text-foreground">
                План без эпика / фичи
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Назначения на карточках без связи с эпиком или фичей</span>
              </th>
              <Metrics summary={unattachedSummary(summary, unattachedPlanHours)} showFact={showFact} />
            </tr> : null}
          </> : null}
        </tbody>;
      })}
      {!projects.length ? <tbody><tr><td colSpan={showFact ? 7 : 6} className="px-4 py-8 text-center text-sm text-muted-foreground">Нет загруженных проектов. Выберите проект в списке выше, чтобы открыть или загрузить его план.</td></tr></tbody> : null}
    </table>
  </div>;
}
