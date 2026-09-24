'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChartNoAxesCombined, Clock3, Layers3, ListChecks, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const statusPalette = ['#625bf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#94a3b8'];

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

function RoleEstimateChart({ roles, totalHours, quarterHours, quarterLabel }: {
  roles: { id: string; name: string; color: string; estimated: number; planned: number }[];
  totalHours: number;
  quarterHours: number;
  quarterLabel: string;
}) {
  const maxValue = Math.max(1, ...roles.map((role) => role.estimated));
  const left = 48;
  const top = 18;
  const plotWidth = 650;
  const plotHeight = 166;
  const baseY = top + plotHeight;
  const groupWidth = plotWidth / Math.max(roles.length, 1);
  const barWidth = Math.min(52, groupWidth * 0.58);

  return <Card className="overflow-hidden">
    <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
      <div className="space-y-1.5"><CardTitle className="text-base">Оценка по ролям</CardTitle><CardDescription>Сумма оценок назначений · {numberFormat.format(totalHours)} ч</CardDescription></div>
      <div className="shrink-0 rounded-lg border border-primary/15 bg-primary/[0.045] px-3 py-2 text-right"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{quarterLabel}</p><p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{numberFormat.format(quarterHours)} ч</p></div>
    </CardHeader>
    <CardContent className="pt-3">
      {roles.length ? <>
        <div className="relative rounded-xl bg-muted/20 px-2 pt-2">
          <svg viewBox="0 0 720 252" role="img" aria-label={`Столбчатая диаграмма оценок по ${roles.length} ролям`} className="h-[230px] w-full overflow-visible">
            <defs>{roles.map((role, index) => <linearGradient key={role.id} id={`role-gradient-${index}`} x1="0" x2="0" y1="1" y2="0"><stop offset="0%" stopColor={role.color} stopOpacity="0.68" /><stop offset="100%" stopColor={role.color} /></linearGradient>)}</defs>
            {[0, 1, 2, 3, 4].map((tick) => {
              const y = baseY - (plotHeight * tick) / 4;
              return <g key={tick}>
                <line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray={tick === 0 ? undefined : '3 5'} strokeWidth={tick === 0 ? 1.4 : 1} />
                <text x={left - 8} y={y + 3.5} fill="hsl(var(--muted-foreground))" fontSize="10" textAnchor="end">{compactFormat.format((maxValue * tick) / 4)}</text>
              </g>;
            })}
            {roles.map((role, index) => {
              const centerX = left + groupWidth * (index + 0.5);
              const height = role.estimated ? Math.max(3, (role.estimated / maxValue) * plotHeight) : 0;
              const labelLines = role.name.split(/\s+/);
              const labelFirst = labelLines[0].length > 10 ? `${labelLines[0].slice(0, 9)}…` : labelLines[0];
              const labelSecond = labelLines.slice(1).join(' ');
              return <g key={role.id}>
                <title>{`${role.name}: ${numberFormat.format(role.estimated)} ч оценки; ${numberFormat.format(role.planned)} ч запланировано на ${quarterLabel}`}</title>
                {role.estimated > 0 ? <>
                  <rect x={centerX - barWidth / 2 + 3} y={baseY - height + 5} width={barWidth} height={height} rx="9" fill={role.color} opacity="0.12" />
                  <rect x={centerX - barWidth / 2} y={baseY - height} width={barWidth} height={height} rx="8" fill={`url(#role-gradient-${index})`} />
                  <text x={centerX} y={Math.max(top + 10, baseY - height - 8)} fill="hsl(var(--foreground))" fontSize="10" fontWeight="600" textAnchor="middle">{compactFormat.format(role.estimated)}</text>
                </> : <circle cx={centerX} cy={baseY - 1} r="3" fill={role.color} opacity="0.55" />}
                <circle cx={centerX} cy={baseY + 12} r="3.5" fill={role.color} />
                <text x={centerX} y={baseY + 30} fill="hsl(var(--foreground))" fontSize="10.5" textAnchor="middle">{labelFirst}</text>
                {labelSecond ? <text x={centerX} y={baseY + 44} fill="hsl(var(--muted-foreground))" fontSize="9.5" textAnchor="middle">{labelSecond.length > 13 ? `${labelSecond.slice(0, 12)}…` : labelSecond}</text> : null}
              </g>;
            })}
          </svg>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>Часы назначений по ролям</span><span>Наведите на столбец для подробностей</span></div>
      </> : <p className="py-12 text-center text-sm text-muted-foreground">В проекте пока нет ролей и назначений.</p>}
    </CardContent>
  </Card>;
}

function FeatureStatusChart({ rows }: { rows: { status: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let currentDegree = 0;
  const stops = rows.map((row, index) => {
    const start = currentDegree;
    currentDegree += total ? (row.count / total) * 360 : 0;
    return `${statusPalette[index % statusPalette.length]} ${start}deg ${currentDegree}deg`;
  });

  return <Card className="overflow-hidden">
    <CardHeader className="pb-2"><CardTitle className="text-base">Состояние фич</CardTitle><CardDescription>Распределение задач по статусам Azure DevOps</CardDescription></CardHeader>
    <CardContent className="pt-4">
      {rows.length ? <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative flex h-44 w-44 shrink-0 items-center justify-center rounded-full p-[15px] shadow-[0_10px_28px_hsl(var(--foreground)/0.08)]" style={{ background: `conic-gradient(from -90deg, ${stops.join(', ')})` }} role="img" aria-label={`Кольцевая диаграмма статусов: ${rows.map((row) => `${row.status} — ${row.count}`).join(', ')}`}>
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-border/70 bg-card text-center"><span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{total}</span><span className="mt-0.5 text-xs text-muted-foreground">фич</span><span className="mt-2 h-px w-10 bg-border" /><span className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">всего</span></div>
        </div>
        <ul className="w-full min-w-0 space-y-3" aria-label="Легенда статусов">
          {rows.map((row, index) => <li key={row.status} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
            <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-muted/60" style={{ backgroundColor: statusPalette[index % statusPalette.length] }} />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.status}</span>
            <span className="text-right"><span className="block text-sm font-semibold tabular-nums text-foreground">{row.count}</span><span className="text-[10px] tabular-nums text-muted-foreground">{Math.round((row.count / total) * 100)}%</span></span>
          </li>)}
        </ul>
      </div> : <p className="py-12 text-center text-sm text-muted-foreground">В проекте пока нет фич.</p>}
    </CardContent>
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

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <RoleEstimateChart roles={roleRows} totalHours={totalEstimatedHours} quarterHours={quarterHours} quarterLabel={`Q${quarter.quarter} ${quarter.year}`} />
          <FeatureStatusChart rows={statusRows} />
        </section>
      </> : null}
    </div>
  </main>;
}
