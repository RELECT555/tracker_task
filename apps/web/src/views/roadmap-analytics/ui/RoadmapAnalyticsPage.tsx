'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChartNoAxesCombined, Clock3, Layers3, ListChecks, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

function currentQuarter() {
  const date = new Date();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const firstMonth = (quarter - 1) * 3;
  const monthKeys = Array.from({ length: 3 }, (_, index) => {
    const month = String(firstMonth + index + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  });
  return { quarter, year: date.getFullYear(), monthKeys };
}

function MetricCard({ title, value, note, icon: Icon }: { title: string; value: string | number; note: string; icon: LucideIcon }) {
  return <Card className="p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p></div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{note}</p>
  </Card>;
}

export function RoadmapAnalyticsPage() {
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);
  const [projectId, setProjectId] = useState('');
  const project = projects.find((item) => item.id === projectId);
  const roadmapProjectId = project?.roadmapId ?? '';
  const quarter = useMemo(currentQuarter, []);
  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const plan = planQuery.data;
  const workItems = useMemo(() => plan?.workItems ?? [], [plan?.workItems]);
  const epics = useMemo(() => workItems.filter((item) => item.type.toLocaleLowerCase('ru-RU') === 'epic'), [workItems]);
  const features = useMemo(() => workItems.filter((item) => item.type.toLocaleLowerCase('ru-RU') !== 'epic'), [workItems]);
  const allocations = useMemo(() => workItems.flatMap((item) => item.allocations), [workItems]);
  const peopleCount = new Set(allocations.map((allocation) => allocation.personExternalId)).size;
  const quarterHours = allocations.reduce((sum, allocation) => sum + allocation.periods.reduce((periodSum, period) => {
    const monthKey = period.monthKey ?? '';
    return periodSum + (quarter.monthKeys.includes(monthKey) ? Number(period.hours) : 0);
  }, 0), 0);
  const totalEstimatedHours = allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
  const featuresWithAssignments = features.filter((feature) => feature.allocations.length > 0).length;

  const statusRows = useMemo(() => {
    const counts = new Map<string, number>();
    features.forEach((feature) => {
      const status = feature.state?.trim() || 'Без статуса';
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });
    return [...counts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status, 'ru'));
  }, [features]);
  const roleRows = useMemo(() => (plan?.roles ?? []).map((role) => {
    const roleAllocations = allocations.filter((allocation) => allocation.roleId === role.id);
    return {
      id: role.id,
      name: role.name,
      color: role.color,
      estimated: roleAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0),
      planned: roleAllocations.reduce((sum, allocation) => sum + allocation.periods.reduce((periodSum, period) => periodSum + (quarter.monthKeys.includes(period.monthKey ?? '') ? Number(period.hours) : 0), 0), 0),
    };
  }).sort((a, b) => b.estimated - a.estimated), [allocations, plan?.roles, quarter.monthKeys]);
  const maxRoleEstimate = Math.max(1, ...roleRows.map((role) => role.estimated));
  const maxStatusCount = Math.max(1, ...statusRows.map((row) => row.count));

  useEffect(() => {
    if (projectId && projects.some((item) => item.id === projectId)) return;
    const firstImported = projects.find((item) => item.imported);
    if (firstImported) setProjectId(firstImported.id);
    else if (projects.length) setProjectId(projects[0].id);
  }, [projectId, projects]);

  return <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">Roadmap</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Аналитика</h1><p className="mt-1.5 text-sm text-muted-foreground">Короткая сводка по задачам, назначениям и квартальному плану.</p></div>
        <AzureProjectPicker projects={projects} value={projectId} onChange={setProjectId} disabled={projectsQuery.isLoading} placeholder="Выбрать проект" />
      </div>

      {projectsQuery.error || planQuery.error ? <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{(projectsQuery.error ?? planQuery.error) instanceof Error ? (projectsQuery.error ?? planQuery.error)?.message : 'Не удалось загрузить аналитику'}</div> : null}
      {projectsQuery.isLoading || (roadmapProjectId && planQuery.isLoading) ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-border bg-card" />)}</div> : !projects.length ? <Card className="p-8 text-center"><p className="font-medium text-foreground">Пока нет проектов</p><p className="mt-1 text-sm text-muted-foreground">Импортируйте проект в Roadmap, чтобы увидеть его метрики.</p></Card> : !roadmapProjectId ? <Card className="p-8 text-center"><p className="font-medium text-foreground">Проект ещё не импортирован</p><p className="mt-1 text-sm text-muted-foreground">Выберите импортированный проект для просмотра аналитики.</p></Card> : plan ? <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{plan.name}</p><p className="text-xs text-muted-foreground">{plan.syncedAt ? `Синхронизировано ${new Date(plan.syncedAt).toLocaleString('ru-RU')}` : 'Данные ещё не синхронизированы'}</p></div></div>
          <span className="rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">Q{quarter.quarter} {quarter.year}</span>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Ключевые показатели">
          <MetricCard title="Эпики" value={epics.length} note="В выбранном проекте" icon={Layers3} />
          <MetricCard title="Фичи" value={features.length} note="Включая элементы без эпика" icon={ListChecks} />
          <MetricCard title="Назначения" value={allocations.length} note={`${featuresWithAssignments} из ${features.length} фич с назначениями`} icon={ChartNoAxesCombined} />
          <MetricCard title="Участники" value={peopleCount} note="Уникальные люди в назначениях" icon={UsersRound} />
          <MetricCard title="План на квартал" value={`${numberFormat.format(quarterHours)} ч`} note="Часы в месячных корзинах квартала" icon={Clock3} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base">Оценка по ролям</CardTitle><CardDescription>Сумма оценок назначений · всего {numberFormat.format(totalEstimatedHours)} ч</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {roleRows.length ? roleRows.map((role) => <div key={role.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} /><span className="truncate text-foreground">{role.name}</span></span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{numberFormat.format(role.estimated)} ч <span className="mx-1 text-border">·</span> {numberFormat.format(role.planned)} ч в квартале</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(role.estimated ? 2 : 0, role.estimated / maxRoleEstimate * 100)}%`, backgroundColor: role.color }} /></div>
              </div>) : <p className="py-5 text-center text-sm text-muted-foreground">В проекте пока нет ролей и назначений.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base">Состояние фич</CardTitle><CardDescription>Распределение по статусам из Azure DevOps</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {statusRows.length ? statusRows.map((row, index) => <div key={row.status} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-foreground">{row.status}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${index === 0 ? 'bg-primary' : index === 1 ? 'bg-sky-500' : 'bg-muted-foreground/40'}`} style={{ width: `${row.count / maxStatusCount * 100}%` }} /></div><span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{row.count}</span>
              </div>) : <p className="py-5 text-center text-sm text-muted-foreground">В проекте пока нет фич.</p>}
            </CardContent>
          </Card>
        </section>
      </> : null}
    </div>
  </main>;
}
