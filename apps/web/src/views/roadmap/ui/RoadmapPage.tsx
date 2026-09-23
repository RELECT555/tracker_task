'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, ArrowDownToLine, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Equal, FolderKanban, Pencil, Plus, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
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
  defaultPersonExternalId,
  onSave,
  saving,
}: {
  item: RoadmapWorkItem;
  role: RoadmapRole;
  people: { id: string; name: string; email: string | null; isMock?: boolean }[];
  initial?: {
    id: string;
    personExternalId: string;
    estimatedHours: number | string;
    periods: RoadmapPeriod[];
  };
  defaultPersonExternalId?: string | null;
  onSave: (data: {
    allocationId?: string;
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
  const selectedPerson = people.find((person) => person.id === personId);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPerson) return;
    onSave({
      allocationId: initial?.id,
      workItemId: item.id,
      roleId: role.id,
      personExternalId: selectedPerson.id,
      personName: selectedPerson.name,
      personEmail: selectedPerson.email,
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

  const startEditing = () => {
    setPersonId(initial?.personExternalId ?? defaultPersonExternalId ?? '');
    setHours(initial ? String(initial.estimatedHours) : '');
    setPeriods(initial?.periods ?? []);
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { if (nextOpen) startEditing(); setOpen(nextOpen); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant={initial ? 'ghost' : 'outline'} size="sm" className={initial ? 'mt-1 h-7 gap-1 px-2 text-xs text-muted-foreground' : 'mt-2 h-8 gap-1.5 px-2.5 text-xs'} aria-label={initial ? `Изменить оценку: ${selectedPerson?.name ?? initial.personExternalId}` : 'Назначить участника'}>
          {initial ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {initial ? 'Изменить назначение' : defaultPersonExternalId ? 'Задать оценку' : 'Добавить участника'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="max-h-[min(80vh,680px)] w-[min(390px,calc(100vw-2rem))] overflow-y-auto rounded-xl p-0">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">{initial ? 'Оценка участника' : 'Назначение участника'}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{role.name} · {item.title}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8" aria-label="Закрыть" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-4 p-4">
            {initial ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{selectedPerson?.name.slice(0, 1) ?? 'У'}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedPerson?.name ?? initial.personExternalId}</p>
                  <p className="truncate text-xs text-muted-foreground">{selectedPerson?.email ?? 'Участник Azure DevOps'}</p>
                </div>
                {selectedPerson?.isMock ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">ДЕМО</span> : null}
              </div>
            ) : null}
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              {initial ? 'Изменить участника' : 'Участник'}
              <select aria-label="Человек из Azure DevOps" value={personId} onChange={(event) => setPersonId(event.target.value)} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="">Выберите участника</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.isMock ? ' · ДЕМО' : ''}{person.email ? ` · ${person.email}` : ''}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              Общая оценка
              <div className="relative">
                <input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground" placeholder="0" />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">часов</span>
              </div>
            </label>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">План по периодам</p><p className="text-xs text-muted-foreground">Необязательно</p></div>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPeriods((all) => [...all, periodDefaults()])}><CalendarDays className="h-3.5 w-3.5" />Добавить</Button>
              </div>
              {periods.length ? periods.map((period, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex gap-2">
                    <input aria-label="Название периода" value={period.label} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm" placeholder="Название периода" />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Удалить период" onClick={() => setPeriods((all) => all.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[11px] text-muted-foreground">С даты<input aria-label="Начало периода" type="date" value={period.startsAt.slice(0, 10)} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, startsAt: event.target.value } : entry))} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground" /></label>
                    <label className="space-y-1 text-[11px] text-muted-foreground">По дату<input aria-label="Конец периода" type="date" value={period.endsAt.slice(0, 10)} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, endsAt: event.target.value } : entry))} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground" /></label>
                  </div>
                  <label className="block space-y-1 text-[11px] text-muted-foreground">Часов за период<input type="number" min="0" step="0.5" value={period.hours} onChange={(event) => setPeriods((all) => all.map((entry, i) => i === index ? { ...entry, hours: Number(event.target.value) } : entry))} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground" /></label>
                </div>
              )) : <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Добавьте периоды, если хотите распределить оценку по времени.</p>}
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit" size="sm" disabled={!personId || saving}><Check className="mr-1.5 h-4 w-4" />{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function RoadmapPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canConfigure = isAdminUser(user);
  const [selectedAzureProjectId, setSelectedAzureProjectId] = useState('');
  const [roadmapProjectId, setRoadmapProjectId] = useState('');
  const [view, setView] = useState<'roles' | 'periods'>('roles');
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(() => new Set());
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [defaultRolePickerId, setDefaultRolePickerId] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const connectionQuery = useQuery({ queryKey: ['roadmap', 'connection'], queryFn: roadmapApi.connection });
  const configured = connectionQuery.data?.configured ?? false;
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'people'], queryFn: roadmapApi.people });
  const roleCatalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog, enabled: canConfigure });
  const projects = projectsQuery.data?.data ?? [];
  const people = peopleQuery.data?.data ?? [];
  const usingCachedProjects = projectsQuery.data?.source === 'cache';
  const selectedProject = projects.find((project) => project.id === selectedAzureProjectId);
  const filteredProjects = projects.filter((project) => project.name.toLocaleLowerCase('ru-RU').includes(projectSearch.trim().toLocaleLowerCase('ru-RU')));

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
  const plan = planQuery.data;
  const roles = plan?.roles ?? [];

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
  const addRoleMutation = useMutation({
    mutationFn: (templateId: string) => roadmapApi.addRoleFromCatalog(roadmapProjectId, templateId),
    onSuccess: async () => {
      setRolePickerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] });
    },
  });
  const setRoleDefaultMutation = useMutation({
    mutationFn: ({ roleId, personExternalId }: { roleId: string; personExternalId: string | null }) => roadmapApi.setRoleDefaultPerson(roleId, personExternalId),
    onSuccess: async () => {
      setDefaultRolePickerId(null);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] });
    },
  });
  const splitMutation = useMutation({
    mutationFn: (allocations: Parameters<typeof roadmapApi.saveAllocation>[0][]) =>
      Promise.all(allocations.map((allocation) => roadmapApi.saveAllocation(allocation))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const epics = useMemo(() => plan?.workItems.filter((item) => item.type.toLowerCase() === 'epic') ?? [], [plan]);
  const features = useMemo(() => plan?.workItems.filter((item) => item.type.toLowerCase() === 'feature') ?? [], [plan]);
  const plannedItems = plan?.workItems ?? [];
  const assignedPeopleCount = new Set([
    ...(plan?.workItems.flatMap((item) => item.allocations.map((allocation) => allocation.personExternalId)) ?? []),
    ...(plan?.roles.flatMap((role) => role.defaultPersonExternalId ? [role.defaultPersonExternalId] : []) ?? []),
  ]).size;
  const totalHours = plan?.workItems.reduce((sum, item) => sum + item.allocations.reduce((inner, allocation) => inner + Number(allocation.estimatedHours), 0), 0) ?? 0;

  function splitEvenly(workItemId: string, allocations: RoadmapWorkItem['allocations']) {
    if (allocations.length < 2) return;
    const share = (total: number, index: number) => {
      const roundedShare = Math.round((total / allocations.length) * 100) / 100;
      return index === allocations.length - 1
        ? Math.round((total - roundedShare * (allocations.length - 1)) * 100) / 100
        : roundedShare;
    };
    const totalEstimatedHours = allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const periodTotals = new Map<string, { label: string; startsAt: string; endsAt: string; hours: number }>();
    allocations.flatMap((allocation) => allocation.periods).forEach((period) => {
      const key = `${period.label}|${period.startsAt.slice(0, 10)}|${period.endsAt.slice(0, 10)}`;
      const existing = periodTotals.get(key);
      periodTotals.set(key, existing
        ? { ...existing, hours: existing.hours + Number(period.hours) }
        : { label: period.label, startsAt: period.startsAt, endsAt: period.endsAt, hours: Number(period.hours) });
    });
    splitMutation.mutate(allocations.map((allocation, index) => ({
      workItemId,
      roleId: allocation.roleId,
      personExternalId: allocation.personExternalId,
      personName: allocation.personName,
      personEmail: allocation.personEmail,
      estimatedHours: share(totalEstimatedHours, index),
      periods: [...periodTotals.values()].map((period) => ({
        label: period.label,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        hours: share(period.hours, index),
      })),
    })));
  }

  function renderItemRow(item: RoadmapWorkItem, isEpic = false, childCount = 0, collapsed = false, onToggle?: () => void) {
    const epicChildren = isEpic ? features.filter((feature) => feature.parentExternalId === item.externalId) : [];
    const itemAllocations = isEpic ? [...item.allocations, ...epicChildren.flatMap((feature) => feature.allocations)] : item.allocations;
    const itemHours = itemAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const periods = itemAllocations.flatMap((allocation) => allocation.periods);
    return (
      <tr key={item.id} className={`border-t border-border/70 align-top hover:bg-muted/20 ${isEpic ? 'bg-muted/20' : ''}`}>
        <td className="min-w-64 px-4 py-3">
          <div className={isEpic ? 'font-medium text-foreground' : 'pl-4'}>
            <div className="flex items-center gap-2">
              {isEpic ? <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Развернуть' : 'Свернуть'} эпик ${item.title}`} disabled={!childCount} onClick={onToggle} className="-ml-1 inline-flex min-h-7 min-w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />}
              <span className="text-sm leading-snug">{item.title}</span>
              {isEpic ? <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{childCount} фич</span> : null}
            </div>
            <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{item.type} · #{item.externalId}{item.state ? ` · ${item.state}` : ''}</p>
          </div>
        </td>
        {roles.map((role) => {
          const allocations = item.allocations.filter((allocation) => allocation.roleId === role.id);
          const rolePeople = people.filter((person) => role.members?.some((member) => member.personExternalId === person.id && member.personIsActive));
          const featureAllocations = isEpic ? epicChildren.flatMap((feature) => feature.allocations.filter((allocation) => allocation.roleId === role.id)) : [];
          const renderAssignment = (allocation: typeof allocations[number]) => (
            <div key={allocation.id}>
              <div className="rounded-md border border-border/70 bg-background px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{allocation.personName.slice(0, 1)}</span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-xs font-medium text-foreground">{allocation.personName}</p>
                        {people.find((person) => person.id === allocation.personExternalId)?.isMock ? <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">демо</span> : null}
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{allocation.personEmail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">{view === 'roles' ? `${Number(allocation.estimatedHours)} ч` : `${allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0)} ч`}</span>
                </div>
                {view === 'periods' && allocation.periods.length ? <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">{allocation.periods.map((period) => <div key={period.id ?? period.startsAt} className="flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{period.label}</span><span className="tabular-nums">{Number(period.hours)} ч</span></div>)}</div> : null}
              </div>
              {rolePeople.length ? <AllocationEditor item={item} role={role} people={rolePeople} initial={allocation} defaultPersonExternalId={role.defaultPersonExternalId} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} /> : null}
            </div>
          );
          const renderDefaultPerson = () => role.defaultPersonExternalId && role.defaultPersonName ? <div className="rounded-md border border-dashed border-primary/30 bg-primary/[0.035] px-2.5 py-2"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{role.defaultPersonName.slice(0, 1)}</span><div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{role.defaultPersonName}</p><p className="truncate text-[10px] text-muted-foreground">{role.defaultPersonEmail}</p></div></div><span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">по умолчанию</span></div></div> : null;
          return (
            <td key={role.id} className="min-w-52 px-3 py-3">
              {isEpic ? (
                <div className="space-y-2">
                  {featureAllocations.length ? <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{featureAllocations.length} назнач. в фичах</span><span className="ml-2 tabular-nums">{featureAllocations.reduce((sum, allocation) => sum + Number(view === 'roles' ? allocation.estimatedHours : allocation.periods.reduce((periodSum, period) => periodSum + Number(period.hours), 0)), 0)} ч</span></div> : <span className="text-xs text-muted-foreground">Нет назначений в фичах</span>}
                  <div className="space-y-1.5 border-l-2 border-primary/20 pl-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">На эпике отдельно</p>
                    {!allocations.length ? renderDefaultPerson() : null}
                    {allocations.map(renderAssignment)}
                    {rolePeople.length ? <AllocationEditor item={item} role={role} people={rolePeople} defaultPersonExternalId={role.defaultPersonExternalId} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} /> : <span className="text-[10px] text-muted-foreground">Добавьте участника в роль в администрировании.</span>}
                  </div>
                </div>
              ) : <div className="space-y-2">
                {allocations.length > 1 ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={saveMutation.isPending || splitMutation.isPending} title="Распределить общий объём часов и часы периодов поровну между участниками" onClick={() => splitEvenly(item.id, allocations)}>
                    <Equal className="h-3.5 w-3.5" />{splitMutation.isPending ? 'Делим часы…' : 'Разделить поровну'}
                  </Button>
                ) : null}
                {!allocations.length ? renderDefaultPerson() : null}
                {allocations.map(renderAssignment)}
                {!isEpic ? rolePeople.length ? (
                  <AllocationEditor item={item} role={role} people={rolePeople} defaultPersonExternalId={role.defaultPersonExternalId} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} />
                ) : (
                  <div className="px-1 pt-1 text-[11px] text-muted-foreground">
                    <p>{people.length ? 'К роли не добавлены участники' : 'Список участников Azure DevOps не синхронизирован'}</p>
                    {canConfigure ? <Link href={people.length ? routes.roadmapAdminRoles : routes.roadmapAdminUsers} className="mt-1 inline-flex text-primary hover:underline">{people.length ? 'Добавить людей в роль' : 'Синхронизировать пользователей'}</Link> : <p className="mt-1">Попросите администратора настроить участников роли.</p>}
                  </div>
                ) : null}
              </div>}
            </td>
          );
        })}
        {!roles.length ? <td className="min-w-52 px-3 py-3 text-xs text-muted-foreground">Роль не настроена</td> : null}
        <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground ${isEpic ? 'bg-muted/30' : ''}`}>
          {view === 'roles'
            ? `${itemHours} ч`
            : `${periods.reduce((sum, period) => sum + Number(period.hours), 0)} ч`}
        </td>
      </tr>
    );
  }

  const errors = [connectionQuery.error, projectsQuery.error, peopleQuery.error, planQuery.error, syncMutation.error, saveMutation.error, splitMutation.error, addRoleMutation.error, setRoleDefaultMutation.error, roleCatalogQuery.error];

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Планирование ресурсов</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">План проекта</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="h-10 w-[min(360px,calc(100vw-2rem))] justify-between px-3 text-left" disabled={!projects.length} aria-label="Выбрать проект Azure DevOps">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><FolderKanban className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{selectedProject?.name ?? (configured ? 'Выбрать проект Azure DevOps' : 'Выбрать локальный проект')}</span><span className="block text-[10px] font-normal text-muted-foreground">{selectedProject ? selectedProject.imported ? 'План проекта' : 'Доступен для импорта' : 'Проекты Azure DevOps'}</span></span>
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0">
                  <div className="border-b border-border p-2.5">
                    <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Найти проект…" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-1.5">
                    {filteredProjects.length ? <>
                      {filteredProjects.some((project) => project.imported) ? <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">В Roadmap</p> : null}
                      {filteredProjects.filter((project) => project.imported).map((project) => <button key={project.id} type="button" onClick={() => { setSelectedAzureProjectId(project.id); setProjectPickerOpen(false); setProjectSearch(''); }} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted ${project.id === selectedAzureProjectId ? 'bg-primary/5' : ''}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><Check className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{project.name}</span><span className="block text-[10px] text-muted-foreground">Импортирован · план готов</span></span>{project.id === selectedAzureProjectId ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                      </button>)}
                      {filteredProjects.some((project) => !project.imported) ? <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Доступны для импорта</p> : null}
                      {filteredProjects.filter((project) => !project.imported).map((project) => <button key={project.id} type="button" onClick={() => { setSelectedAzureProjectId(project.id); setProjectPickerOpen(false); setProjectSearch(''); }} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted ${project.id === selectedAzureProjectId ? 'bg-primary/5' : ''}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ArrowDownToLine className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{project.name}</span><span className="block text-[10px] text-muted-foreground">Не импортирован</span></span>{project.id === selectedAzureProjectId ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                      </button>)}
                    </> : <div className="px-3 py-8 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium text-foreground">Проект не найден</p><p className="mt-1 text-xs text-muted-foreground">Попробуйте изменить запрос.</p></div>}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                onClick={() => selectedProject && syncMutation.mutate(selectedProject)}
                disabled={!selectedProject || syncMutation.isPending || usingCachedProjects}
                className="gap-2"
              >
                {syncMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                {usingCachedProjects ? 'Azure недоступен' : selectedProject?.imported ? 'Синхронизировать' : 'Импортировать'}
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
          {usingCachedProjects ? <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">Azure DevOps временно недоступен. Показаны ранее импортированные проекты из локальной базы; планирование и демо-назначения доступны.</div> : null}
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
                  {canConfigure ? <Link href={routes.roadmapAdminRoles} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted"><Users className="h-4 w-4" />Управление ролями</Link> : null}
                </div>

                <div className="flex items-center gap-1 border-b border-border px-4 py-2">
                  <Button type="button" size="sm" variant={view === 'roles' ? 'secondary' : 'ghost'} onClick={() => setView('roles')} className="h-8 gap-1.5"><Users className="h-3.5 w-3.5" />По ролям</Button>
                  <Button type="button" size="sm" variant={view === 'periods' ? 'secondary' : 'ghost'} onClick={() => setView('periods')} className="h-8 gap-1.5"><Clock3 className="h-3.5 w-3.5" />По периодам</Button>
                </div>

                {roles.length && !people.length && configured ? <div className="border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Чтобы назначать людей на роли, сначала синхронизируйте пользователей Azure DevOps в администрировании Roadmap.</div> : null}

                {!plan.workItems.length ? (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">В проекте пока нет эпиков или фич. Синхронизируйте его с Azure DevOps.</div>
                ) : (
                  <div className="overflow-auto">
                    {!roles.length ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Эпики и связанные фичи загружены</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Добавьте роли и закрепите за ними сотрудников, чтобы распределять часы по фичам.</p>
                        </div>
                        {canConfigure ? <Link href={routes.roadmapAdminRoles} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"><Users className="h-4 w-4" />Настроить роли</Link> : null}
                      </div>
                    ) : null}
                    <table className="w-full min-w-max border-collapse text-left">
                      <thead className="sticky top-0 z-[1] bg-muted/80">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="min-w-72 px-4 py-2.5"><div className="flex items-center justify-between gap-3"><span>Эпик / фича</span>{canConfigure ? <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
                            <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1 px-2.5 text-xs" disabled={!roadmapProjectId || addRoleMutation.isPending}><Plus className="h-3.5 w-3.5" />Добавить роль</Button></PopoverTrigger>
                            <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(320px,calc(100vw-2rem))] rounded-xl p-2">
                              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Роли из каталога</p>
                              {roleCatalogQuery.isLoading ? <p className="px-2 py-4 text-center text-sm text-muted-foreground">Загружаем каталог…</p> : (roleCatalogQuery.data ?? []).filter((template) => !roles.some((role) => role.name === template.name)).length ? (roleCatalogQuery.data ?? []).filter((template) => !roles.some((role) => role.name === template.name)).map((template) => <button key={template.id} type="button" disabled={addRoleMutation.isPending} onClick={() => addRoleMutation.mutate(template.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: template.color }} /><span className="min-w-0 flex-1 truncate">{template.name}</span>{template.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}<Plus className="h-3.5 w-3.5 text-muted-foreground" /></button>) : <div className="px-2 py-3 text-sm text-muted-foreground">{(roleCatalogQuery.data ?? []).length ? 'Все роли из каталога уже добавлены.' : 'Каталог ролей пуст.'}{!(roleCatalogQuery.data ?? []).length ? <Link href={routes.roadmapAdminRoles} className="mt-1 block text-primary hover:underline">Создать роли в администрировании</Link> : null}</div>}
                            </PopoverContent>
                          </Popover> : null}</div></th>
                          {roles.map((role) => <th key={role.id} className="min-w-52 px-3 py-2.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: role.color }} /><span>{role.name}</span>{role.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium normal-case text-amber-700 dark:text-amber-300">демо</span> : null}</div>
                              {canConfigure ? <Popover open={defaultRolePickerId === role.id} onOpenChange={(open) => setDefaultRolePickerId(open ? role.id : null)}>
                                <PopoverTrigger asChild><button type="button" className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] font-medium normal-case text-muted-foreground transition-colors hover:bg-background hover:text-foreground"><Users className="h-3 w-3 shrink-0" /><span className="truncate">{role.defaultPersonName ? `По умолчанию: ${role.defaultPersonName}` : 'Закрепить человека по умолчанию'}</span></button></PopoverTrigger>
                                <PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={16} className="w-[min(300px,calc(100vw-2rem))] rounded-xl p-2">
                                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Человек по умолчанию · {role.name}</p>
                                  {(role.members ?? []).filter((member) => member.personIsActive).map((member) => <button key={member.personExternalId} type="button" disabled={setRoleDefaultMutation.isPending || role.defaultPersonExternalId === member.personExternalId} onClick={() => setRoleDefaultMutation.mutate({ roleId: role.id, personExternalId: member.personExternalId })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{member.personName.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate">{member.personName}</span><span className="block truncate text-[10px] text-muted-foreground">{member.personEmail}</span></span>{role.defaultPersonExternalId === member.personExternalId ? <Check className="h-4 w-4 text-primary" /> : null}</button>)}
                                  {!(role.members ?? []).some((member) => member.personIsActive) ? <div className="px-2 py-3 text-sm text-muted-foreground">Сначала добавьте участника в эту роль в администрировании.</div> : null}
                                  {role.defaultPersonExternalId ? <button type="button" disabled={setRoleDefaultMutation.isPending} onClick={() => setRoleDefaultMutation.mutate({ roleId: role.id, personExternalId: null })} className="mt-1 w-full rounded-lg border-t border-border px-2 py-2 text-left text-xs text-muted-foreground hover:text-foreground">Снять назначение по умолчанию</button> : null}
                                </PopoverContent>
                              </Popover> : role.defaultPersonName ? <span className="block truncate text-[10px] font-medium normal-case text-muted-foreground">По умолчанию: {role.defaultPersonName}</span> : null}
                            </div>
                          </th>)}
                          {!roles.length ? <th className="min-w-52 px-3 py-3">Роль / участник</th> : null}
                          <th className="min-w-24 px-4 py-3 text-right">{view === 'roles' ? 'Всего' : 'По периодам'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {epics.map((epic) => {
                          const children = features.filter((feature) => feature.parentExternalId === epic.externalId);
                          const collapsed = !expandedEpics.has(epic.id);
                          return <Fragment key={epic.id}>
                            {renderItemRow(epic, true, children.length, collapsed, () => setExpandedEpics((current) => {
                              const next = new Set(current);
                              if (next.has(epic.id)) next.delete(epic.id);
                              else next.add(epic.id);
                              return next;
                            }))}
                            {!collapsed ? children.map((feature) => renderItemRow(feature)) : null}
                          </Fragment>;
                        })}
                        {features.filter((feature) => !feature.parentExternalId || !epics.some((epic) => epic.externalId === feature.parentExternalId)).map((feature) => renderItemRow(feature))}
                      </tbody>
                      <tfoot className="border-t-2 border-border bg-muted/60">
                        <tr className="text-sm font-semibold text-foreground">
                          <th scope="row" className="px-4 py-3">Итого по проекту</th>
                          {roles.map((role) => {
                            const roleAllocations = plannedItems.flatMap((item) => item.allocations.filter((allocation) => allocation.roleId === role.id));
                            const hours = roleAllocations.reduce((sum, allocation) => sum + (view === 'roles'
                              ? Number(allocation.estimatedHours)
                              : allocation.periods.reduce((periodSum, period) => periodSum + Number(period.hours), 0)), 0);
                            return <td key={role.id} className="px-3 py-3 tabular-nums">{hours} ч</td>;
                          })}
                          {!roles.length ? <td className="px-3 py-3 text-muted-foreground">—</td> : null}
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{view === 'roles' ? totalHours : plannedItems
                            .flatMap((item) => item.allocations)
                            .reduce((sum, allocation) => sum + allocation.periods.reduce((periodSum, period) => periodSum + Number(period.hours), 0), 0)} ч</td>
                        </tr>
                      </tfoot>
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
