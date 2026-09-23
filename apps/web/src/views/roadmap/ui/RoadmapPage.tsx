'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, ArrowDownToLine, CalendarDays, Clock3, Plus, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import {
  roadmapApi,
  type AzureProject,
  type RoadmapPeriod,
  type RoadmapRole,
  type RoadmapWorkItem,
} from '@/entities/roadmap/api/roadmapApi';

function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error instanceof Error ? error.message : 'Не удалось выполнить запрос'}</span>
    </div>
  );
}

function periodDefaults(): RoadmapPeriod {
  const start = new Date();
  start.setDate(1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    label: start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    startsAt: iso(start),
    endsAt: iso(end),
    hours: 0,
  };
}

function AllocationEditor({
  item,
  role,
  people,
  initial,
  onSave,
  saving,
}: {
  item: RoadmapWorkItem;
  role: RoadmapRole;
  people: { id: string; name: string; email: string | null }[];
  initial?: {
    personExternalId: string;
    estimatedHours: number | string;
    periods: RoadmapPeriod[];
  };
  onSave: (data: {
    workItemId: string;
    roleId: string;
    personExternalId: string;
    personName: string;
    personEmail?: string | null;
    estimatedHours: number;
    periods: Omit<RoadmapPeriod, 'id'>[];
  }) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [hours, setHours] = useState('');
  const [periods, setPeriods] = useState<RoadmapPeriod[]>([]);
  const currentPeople = people;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const person = currentPeople.find((candidate) => candidate.id === personId);
    if (!person) return;
    onSave({
      workItemId: item.id,
      roleId: role.id,
      personExternalId: person.id,
      personName: person.name,
      personEmail: person.email,
      estimatedHours: Number(hours) || 0,
      periods: periods.map((period) => ({
        label: period.label,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        hours: Number(period.hours) || 0,
      })),
    });
    setOpen(false);
    setHours('');
    setPeriods([]);
  };

  return (
    <div className="mt-2">
      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => {
        setOpen((value) => {
          if (!value) {
            setPersonId(initial?.personExternalId ?? '');
            setHours(initial ? String(initial.estimatedHours) : '');
            setPeriods(initial?.periods ?? []);
          }
          return !value;
        });
      }}>
        {initial ? <Clock3 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {initial ? 'Изменить' : 'Назначить'}
      </Button>
      {open ? (
        <form onSubmit={submit} className="mt-2 min-w-64 space-y-2 rounded-lg border border-border bg-background p-3 shadow-sm">
          <select
            aria-label="Человек из Azure DevOps"
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            disabled={Boolean(initial)}
            required
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">Выбрать человека</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}{person.email ? ` · ${person.email}` : ''}</option>
            ))}
          </select>
          <label className="block text-xs text-muted-foreground">
            Всего, часов
            <input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" placeholder="Например, 24" />
          </label>
          {periods.map((period, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2">
              <input aria-label="Период" value={period.label} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} className="col-span-2 h-8 rounded border border-input bg-background px-2 text-xs" />
              <input aria-label="Начало периода" type="date" value={period.startsAt.slice(0, 10)} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, startsAt: event.target.value } : entry))} className="h-8 min-w-0 rounded border border-input bg-background px-1 text-xs" />
              <input aria-label="Конец периода" type="date" value={period.endsAt.slice(0, 10)} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, endsAt: event.target.value } : entry))} className="h-8 min-w-0 rounded border border-input bg-background px-1 text-xs" />
              <label className="col-span-2 text-xs text-muted-foreground">Часов за период
                <input type="number" min="0" step="0.5" value={period.hours} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, hours: Number(event.target.value) } : entry))} className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground" />
              </label>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPeriods((all) => [...all, periodDefaults()])}>
              <CalendarDays className="mr-1 h-3.5 w-3.5" /> Добавить период
            </Button>
            <Button type="submit" size="sm" className="h-7" disabled={!personId || saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function RoadmapPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canConfigure = isAdminUser(user);
  const [selectedAzureProjectId, setSelectedAzureProjectId] = useState('');
  const [roadmapProjectId, setRoadmapProjectId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [view, setView] = useState<'roles' | 'periods'>('roles');

  const connectionQuery = useQuery({ queryKey: ['roadmap', 'connection'], queryFn: roadmapApi.connection });
  const configured = connectionQuery.data?.configured ?? false;
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects, enabled: configured });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'people'], queryFn: roadmapApi.people, enabled: configured });
  const rolesQuery = useQuery({ queryKey: ['roadmap', 'roles'], queryFn: roadmapApi.roles });
  const projects = projectsQuery.data?.data ?? [];
  const people = peopleQuery.data?.data ?? [];
  const roles = rolesQuery.data ?? [];
  const selectedProject = projects.find((project) => project.id === selectedAzureProjectId);

  useEffect(() => {
    if (selectedAzureProjectId || !projects.length) return;
    const first = projects.find((project) => project.imported) ?? projects[0];
    setSelectedAzureProjectId(first.id);
    if (first.roadmapId) setRoadmapProjectId(first.roadmapId);
  }, [projects, selectedAzureProjectId]);

  useEffect(() => {
    if (selectedProject?.roadmapId) setRoadmapProjectId(selectedProject.roadmapId);
    else if (selectedProject && !selectedProject.imported) setRoadmapProjectId('');
  }, [selectedProject]);

  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });

  const syncMutation = useMutation({
    mutationFn: (project: AzureProject) => roadmapApi.syncProject(project),
    onSuccess: async (result) => {
      setRoadmapProjectId(result.projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', result.projectId] }),
      ]);
    },
  });
  const saveMutation = useMutation({
    mutationFn: roadmapApi.saveAllocation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const roleMutation = useMutation({
    mutationFn: roadmapApi.createRole,
    onSuccess: async () => {
      setRoleName('');
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'roles'] });
    },
  });

  const plan = planQuery.data;
  const epics = useMemo(() => plan?.workItems.filter((item) => item.type.toLowerCase() === 'epic') ?? [], [plan]);
  const features = useMemo(() => plan?.workItems.filter((item) => item.type.toLowerCase() === 'feature') ?? [], [plan]);
  const assignedPeopleCount = new Set(plan?.workItems.flatMap((item) => item.allocations.map((allocation) => allocation.personExternalId)) ?? []).size;
  const totalHours = plan?.workItems.reduce((sum, item) => sum + item.allocations.reduce((inner, allocation) => inner + Number(allocation.estimatedHours), 0), 0) ?? 0;

  function renderItemRow(item: RoadmapWorkItem, isEpic = false) {
    const itemHours = item.allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const periods = item.allocations.flatMap((allocation) => allocation.periods);
    return (
      <tr key={item.id} className="border-t border-border/70 align-top hover:bg-muted/20">
        <td className="min-w-64 px-4 py-3">
          <div className={isEpic ? 'font-medium text-foreground' : 'pl-4'}>
            <div className="flex items-center gap-2">
              {!isEpic ? <span className="h-1.5 w-1.5 rounded-full bg-primary/60" /> : null}
              <span className="text-sm leading-snug">{item.title}</span>
            </div>
            <p className="mt-1 pl-4 text-[11px] text-muted-foreground">{item.type} · #{item.externalId}{item.state ? ` · ${item.state}` : ''}</p>
          </div>
        </td>
        {roles.map((role) => {
          const allocations = item.allocations.filter((allocation) => allocation.roleId === role.id);
          return (
            <td key={role.id} className="min-w-52 px-3 py-3">
              <div className="space-y-2">
                {allocations.map((allocation) => (
                  <div key={allocation.id}>
                    <div className="rounded-md border border-border/70 bg-background px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{allocation.personName}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{allocation.personEmail}</p>
                        </div>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
                          {view === 'roles'
                            ? `${Number(allocation.estimatedHours)} ч`
                            : `${allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0)} ч`}
                        </span>
                      </div>
                      {view === 'periods' && allocation.periods.length ? (
                        <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">
                          {allocation.periods.map((period) => (
                            <div key={period.id ?? period.startsAt} className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                              <span>{period.label}</span><span className="tabular-nums">{Number(period.hours)} ч</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {!isEpic && people.length ? <AllocationEditor item={item} role={role} people={people.filter((person) => role.members?.some((member) => member.personExternalId === person.id))} initial={allocation} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} /> : null}
                  </div>
                ))}
                {!isEpic && people.length ? (
                  <AllocationEditor item={item} role={role} people={people.filter((person) => role.members?.some((member) => member.personExternalId === person.id))} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} />
                ) : null}
              </div>
            </td>
          );
        })}
        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground">
          {view === 'roles'
            ? `${itemHours} ч`
            : `${periods.reduce((sum, period) => sum + Number(period.hours), 0)} ч`}
        </td>
      </tr>
    );
  }

  const errors = [connectionQuery.error, projectsQuery.error, peopleQuery.error, planQuery.error, syncMutation.error, saveMutation.error, roleMutation.error];

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Планирование ресурсов</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">План проекта</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Проект Azure DevOps"
                value={selectedAzureProjectId}
                onChange={(event) => setSelectedAzureProjectId(event.target.value)}
                disabled={!configured || !projects.length}
                className="h-10 min-w-56 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
              >
                <option value="">{configured ? 'Выбрать проект Azure DevOps' : 'Azure DevOps не подключён'}</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.imported ? ' · импортирован' : ''}</option>)}
              </select>
              <Button
                onClick={() => selectedProject && syncMutation.mutate(selectedProject)}
                disabled={!selectedProject || syncMutation.isPending}
                className="gap-2"
              >
                {syncMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                {selectedProject?.imported ? 'Синхронизировать' : 'Импортировать'}
              </Button>
            </div>
          </div>

          {!configured ? (
            <section className="rounded-xl border border-primary/20 bg-primary/[0.035] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><ArrowDownToLine className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-medium text-foreground">Azure DevOps не подключён</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {canConfigure
                      ? 'Откройте администрирование Roadmap, чтобы подключить организацию и настроить импорт.'
                      : 'Попросите администратора Roadmap настроить интеграцию с Azure DevOps.'}
                  </p>
                  {canConfigure ? (
                    <Link href={routes.roadmapAdmin} className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                      Открыть интеграции
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
          {errors.map((error, index) => error ? <ErrorMessage key={index} error={error} /> : null)}

          {plan ? (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Эпики и фичи</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{plan.workItems.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Общая оценка</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{totalHours} <span className="text-sm font-normal text-muted-foreground">часов</span></p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Участники в плане</p>
                  <p className="mt-1 flex items-center gap-2 text-xl font-semibold tabular-nums text-foreground"><Users className="h-4 w-4 text-muted-foreground" />{assignedPeopleCount}</p>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="font-medium text-foreground">{plan.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {plan.syncedAt ? `Синхронизировано ${new Date(plan.syncedAt).toLocaleString('ru-RU')}` : 'Данные ещё не синхронизированы'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form onSubmit={(event) => { event.preventDefault(); if (roleName.trim()) roleMutation.mutate(roleName.trim()); }} className="flex items-center gap-1.5">
                      <input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Новая роль" aria-label="Название новой роли" className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm sm:w-40" />
                      <Button type="submit" variant="outline" size="sm" disabled={!roleName.trim() || roleMutation.isPending} className="h-9 gap-1.5"><Plus className="h-3.5 w-3.5" />Роль</Button>
                    </form>
                  </div>
                </div>

                <div className="flex items-center gap-1 border-b border-border px-4 py-2">
                  <Button type="button" size="sm" variant={view === 'roles' ? 'secondary' : 'ghost'} onClick={() => setView('roles')} className="h-8 gap-1.5"><Users className="h-3.5 w-3.5" />По ролям</Button>
                  <Button type="button" size="sm" variant={view === 'periods' ? 'secondary' : 'ghost'} onClick={() => setView('periods')} className="h-8 gap-1.5"><Clock3 className="h-3.5 w-3.5" />По периодам</Button>
                </div>

                {!roles.length ? (
                  <div className="px-6 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/70" />
                    <h3 className="mt-3 font-medium text-foreground">Сначала добавьте роли</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Например: Backend, Frontend, QA или Аналитика. Затем распределите участников по ячейкам.</p>
                  </div>
                ) : !plan.workItems.length ? (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">В проекте пока нет эпиков или фич. Синхронизируйте его с Azure DevOps.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-max border-collapse text-left">
                      <thead className="sticky top-0 z-[1] bg-muted/80">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="min-w-72 px-4 py-3">Эпик / фича</th>
                          {roles.map((role) => <th key={role.id} className="min-w-52 px-3 py-3"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />{role.name}</span></th>)}
                          <th className="min-w-24 px-4 py-3 text-right">{view === 'roles' ? 'Всего' : 'По периодам'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {epics.map((epic) => <Fragment key={epic.id}>
                          {renderItemRow(epic, true)}
                          {features.filter((feature) => feature.parentExternalId === epic.externalId).map((feature) => renderItemRow(feature))}
                        </Fragment>)}
                        {features.filter((feature) => !feature.parentExternalId || !epics.some((epic) => epic.externalId === feature.parentExternalId)).map((feature) => renderItemRow(feature))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : configured ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
              {projectsQuery.isLoading ? <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /> : <ArrowDownToLine className="mx-auto h-7 w-7 text-muted-foreground" />}
              <p className="mt-3 text-sm text-muted-foreground">
                {projectsQuery.isLoading ? 'Загружаем проекты Azure DevOps…' : selectedProject ? 'Импортируйте выбранный проект, чтобы создать план.' : 'Выберите проект Azure DevOps выше.'}
              </p>
            </div>
          ) : null}
        </div>
    </main>
  );
}
