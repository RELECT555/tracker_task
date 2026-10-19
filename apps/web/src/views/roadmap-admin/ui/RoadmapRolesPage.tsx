'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Check, GripVertical, Layers3, Loader2, Pipette, Plus, Save, Search, ShieldCheck, Users, X } from 'lucide-react';
import { roadmapApi, type RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { RoleMark } from '@/shared/ui/color-mark';

type DragItem = { kind: 'template'; id: string } | { kind: 'projectRole'; id: string };

const DRAG_MIME = 'application/x-roadmap-role';

function membersLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'участник' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'участника' : 'участников';
  return `${count} ${word}`;
}

export function RoadmapRolesPage() {
  const client = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);
  const catalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog });
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const roadmapProjectId = selectedProject?.roadmapId ?? '';
  const rolesQuery = useQuery({
    queryKey: ['roadmap', 'admin', 'roles', roadmapProjectId],
    queryFn: () => roadmapApi.adminRoles(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const people = (peopleQuery.data ?? []).filter((person) => person.isActive);
  const [selectedId, setSelectedId] = useState('');
  const [showTemplateCreate, setShowTemplateCreate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<'catalog' | 'project' | null>(null);
  const [pendingTemplateIds, setPendingTemplateIds] = useState<string[]>([]);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [confirmingId, setConfirmingId] = useState('');
  const [pendingSwitchId, setPendingSwitchId] = useState('');
  const selectedRole = roles.find((role) => role.id === selectedId);
  const selectedRoleMemberIds = useMemo(() => selectedRole?.members?.map((member) => member.personExternalId) ?? [], [selectedRole?.members]);
  const projectRoleNames = useMemo(() => new Set(roles.map((role) => role.name)), [roles]);
  const visiblePeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    const found = term ? people.filter((person) => `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term)) : people;
    // Назначенные участники — сверху; порядок берётся из сохранённого состава, чтобы строки не прыгали при кликах.
    return [...found].sort((a, b) => Number(selectedRoleMemberIds.includes(b.id)) - Number(selectedRoleMemberIds.includes(a.id)));
  }, [people, search, selectedRoleMemberIds]);
  const visibleCatalog = useMemo(() => {
    const term = catalogSearch.trim().toLocaleLowerCase('ru-RU');
    return term ? catalog.filter((role) => role.name.toLocaleLowerCase('ru-RU').includes(term)) : catalog;
  }, [catalog, catalogSearch]);
  const addableTemplates = useMemo(
    () => visibleCatalog.filter((template) => !projectRoleNames.has(template.name) && !pendingTemplateIds.includes(template.id)),
    [visibleCatalog, projectRoleNames, pendingTemplateIds],
  );
  const pendingTemplates = catalog.filter((template) => pendingTemplateIds.includes(template.id) && !projectRoleNames.has(template.name));
  const canEditProject = Boolean(roadmapProjectId);
  const dirty = Boolean(selectedRole) && (
    name.trim() !== selectedRole?.name || color !== selectedRole?.color ||
    memberIds.length !== selectedRoleMemberIds.length || memberIds.some((id) => !selectedRoleMemberIds.includes(id))
  );

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      const project = projects.find((item) => item.imported) ?? projects[0];
      setSelectedProjectId(project.id);
    }
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects.find((item) => item.imported)?.id ?? projects[0]?.id ?? '');
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedId && roles.length) setSelectedId(roles[0].id);
    if (selectedId && !roles.some((role) => role.id === selectedId)) setSelectedId(roles[0]?.id ?? '');
  }, [roles, selectedId]);

  useEffect(() => {
    if (!selectedRole) return;
    setName(selectedRole.name);
    setColor(selectedRole.color);
    setMemberIds(selectedRoleMemberIds);
  }, [selectedRole, selectedRoleMemberIds]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'role-catalog'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles', roadmapProjectId] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
    ]);
  };
  const createTemplate = useMutation({
    mutationFn: () => roadmapApi.createRoleTemplate(newTemplateName.trim()),
    onSuccess: async () => {
      setNewTemplateName('');
      setShowTemplateCreate(false);
      await refresh();
    },
  });
  const addFromCatalog = useMutation({
    mutationFn: async (templateIds: string[]) => {
      const added: RoadmapRole[] = [];
      for (const templateId of templateIds) added.push(await roadmapApi.addRoleFromCatalog(roadmapProjectId, templateId));
      return added;
    },
    onMutate: (templateIds) => setPendingTemplateIds((current) => [...new Set([...current, ...templateIds])]),
    onSuccess: async (added) => {
      await refresh();
      if (added.length === 1) switchRole(added[0].id);
    },
    onSettled: async (_data, _error, templateIds) => {
      if (_error) await refresh();
      setPendingTemplateIds((current) => current.filter((id) => !templateIds.includes(id)));
    },
  });
  const removeRole = useMutation({
    mutationFn: (roleId: string) => roadmapApi.deleteRole(roleId),
    onMutate: (roleId) => setRemovingIds((current) => [...current, roleId]),
    onSuccess: refresh,
    onSettled: (_data, _error, roleId) => setRemovingIds((current) => current.filter((id) => id !== roleId)),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!selectedRole) return;
      await roadmapApi.updateRole(selectedRole.id, { name: name.trim(), color });
      await roadmapApi.setRoleMembers(selectedRole.id, memberIds);
    },
    onSuccess: refresh,
  });

  const error = projectsQuery.error ?? catalogQuery.error ?? rolesQuery.error ?? peopleQuery.error ?? createTemplate.error ?? addFromCatalog.error ?? removeRole.error ?? save.error;
  const switchRole = (id: string) => {
    if (id === selectedId) return setPendingSwitchId('');
    if (dirty) return setPendingSwitchId(id);
    setPendingSwitchId('');
    setSelectedId(id);
  };
  const discardAndSwitch = () => {
    setSelectedId(pendingSwitchId);
    setPendingSwitchId('');
  };
  const saveAndSwitch = () => save.mutate(undefined, { onSuccess: discardAndSwitch });
  const pendingSwitchRole = roles.find((role) => role.id === pendingSwitchId);
  const togglePerson = (id: string) => setMemberIds((current) => current.includes(id) ? current.filter((personId) => personId !== id) : [...current, id]);
  const selectVisible = () => setMemberIds((current) => [...new Set([...current, ...visiblePeople.map((person) => person.id)])]);
  const clearVisible = () => setMemberIds((current) => current.filter((id) => !visiblePeople.some((person) => person.id === id)));

  const addTemplates = (templateIds: string[]) => {
    const ids = templateIds.filter((id) => {
      const template = catalog.find((item) => item.id === id);
      return template && !projectRoleNames.has(template.name) && !pendingTemplateIds.includes(id);
    });
    if (canEditProject && ids.length) addFromCatalog.mutate(ids);
  };
  const requestRemove = (role: RoadmapRole) => {
    if (removingIds.includes(role.id)) return;
    if (role.members?.length) setConfirmingId(role.id);
    else removeRole.mutate(role.id);
  };
  const confirmRemove = (roleId: string) => {
    setConfirmingId('');
    removeRole.mutate(roleId);
  };

  const startDrag = (event: DragEvent, item: DragItem) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
    event.dataTransfer.setData('text/plain', item.id);
    setDragging(item);
  };
  const endDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };
  const readDrag = (event: DragEvent): DragItem | null => {
    try {
      const raw = event.dataTransfer.getData(DRAG_MIME);
      return raw ? JSON.parse(raw) as DragItem : dragging;
    } catch {
      return dragging;
    }
  };
  const zoneProps = (zone: 'catalog' | 'project', accepts: DragItem['kind']) => ({
    onDragOver: (event: DragEvent) => {
      if (dragging?.kind !== accepts) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropTarget !== zone) setDropTarget(zone);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((current) => current === zone ? null : current);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const item = readDrag(event);
      endDrag();
      if (!item || item.kind !== accepts) return;
      if (item.kind === 'template') addTemplates([item.id]);
      else {
        const role = roles.find((entry) => entry.id === item.id);
        if (role) requestRemove(role);
      }
    },
  });

  const catalogActive = dragging?.kind === 'projectRole';
  const projectActive = dragging?.kind === 'template' && canEditProject;

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Роли</h1><p className="mt-1 text-sm text-muted-foreground">Перетащите роли из каталога в проект, затем назначьте участников</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <AzureProjectPicker projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} disabled={projectsQuery.isLoading} placeholder="Выбрать проект" />
            <Link href={routes.roadmapAdminUsers} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Users className="h-4 w-4" />Пользователи</Link>
          </div>
        </div>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error instanceof Error ? error.message : 'Не удалось сохранить изменения'}</div> : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div {...zoneProps('catalog', 'projectRole')} className={`flex min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card transition-colors ${catalogActive ? dropTarget === 'catalog' ? 'border-destructive/60 bg-destructive/5 ring-2 ring-destructive/20' : 'border-dashed border-destructive/40' : 'border-border'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-muted-foreground" /><h2 className="text-base font-semibold text-foreground">Каталог ролей</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{catalog.length}</span></div><p className="mt-1 text-xs text-muted-foreground">Тяните роль вправо, чтобы добавить в проект</p></div>
              <div className="flex items-center gap-2">
                {canEditProject && addableTemplates.length ? <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" disabled={addFromCatalog.isPending} onClick={() => addTemplates(addableTemplates.map((template) => template.id))}>Добавить все<ArrowRight className="h-3.5 w-3.5" /></Button> : null}
                <Button type="button" size="sm" onClick={() => { setShowTemplateCreate((open) => !open); createTemplate.reset(); }} className="h-9 gap-1.5 px-3"><Plus className="h-4 w-4" />Новая роль</Button>
              </div>
            </div>
            {showTemplateCreate ? <form onSubmit={(event) => { event.preventDefault(); if (newTemplateName.trim()) createTemplate.mutate(); }} className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
              <input aria-label="Название новой роли" autoFocus value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Например, Аналитик" className="h-9 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setShowTemplateCreate(false); setNewTemplateName(''); }}><X className="h-4 w-4" /></Button>
              <Button type="submit" size="sm" className="h-9" disabled={!newTemplateName.trim() || createTemplate.isPending}>{createTemplate.isPending ? 'Создание…' : 'Создать'}</Button>
            </form> : null}
            {catalog.length > 6 ? <div className="border-b border-border px-4 py-3 sm:px-5"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Найти роль" aria-label="Найти роль в каталоге" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20" /></label></div> : null}

            <div className="relative flex-1 overflow-auto p-3 sm:p-4">
              {catalogActive ? <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-destructive/40 bg-card/85 text-sm font-medium text-destructive backdrop-blur-[1px]">Отпустите, чтобы убрать роль из проекта</div> : null}
              {catalogQuery.isLoading ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">Загружаем каталог…</p> : catalog.length ? visibleCatalog.length ? <ul className="grid gap-2 sm:grid-cols-2" aria-label="Каталог ролей">
                {visibleCatalog.map((template) => {
                  const inProject = projectRoleNames.has(template.name);
                  const pending = pendingTemplateIds.includes(template.id) && !inProject;
                  const draggable = canEditProject && !inProject && !pending;
                  return <li key={template.id}
                    draggable={draggable}
                    onDragStart={(event) => startDrag(event, { kind: 'template', id: template.id })}
                    onDragEnd={endDrag}
                    onDoubleClick={() => draggable && addTemplates([template.id])}
                    className={`group flex min-w-0 select-none items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 transition-all ${draggable ? 'cursor-grab border-border hover:border-primary/40 hover:shadow-sm active:cursor-grabbing' : 'border-border/60 opacity-55'} ${dragging?.kind === 'template' && dragging.id === template.id ? 'opacity-40' : ''}`}
                   >
                    <GripVertical className={`h-4 w-4 shrink-0 ${draggable ? 'text-muted-foreground/60 group-hover:text-muted-foreground' : 'text-transparent'}`} />
                    <RoleMark name={template.name} color={template.color} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{template.name}</span>
                    {template.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">демо</span> : null}
                    {inProject ? <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" />в проекте</span>
                      : pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      : draggable ? <button type="button" aria-label={`Добавить роль «${template.name}» в проект`} title="Добавить в проект" onClick={() => addTemplates([template.id])} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"><ArrowRight className="h-4 w-4" /></button> : null}
                  </li>;
                })}
              </ul> : <div className="px-2 py-10 text-center text-sm text-muted-foreground">Роли по запросу «{catalogSearch}» не найдены.</div> : <div className="px-2 py-12 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-medium text-foreground">Каталог пока пуст</p><p className="mt-1 text-sm text-muted-foreground">Создайте первую роль кнопкой «Новая роль».</p></div>}
            </div>
          </div>

          <div {...zoneProps('project', 'template')} className={`flex min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card transition-colors ${projectActive ? dropTarget === 'project' ? 'border-primary bg-primary/5 ring-2 ring-primary/25' : 'border-dashed border-primary/50' : 'border-border'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-base font-semibold text-foreground">{selectedProject?.name ?? 'Проект'}</h2>{canEditProject ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{roles.length}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">Роли проекта · нажмите на роль, чтобы настроить участников</p></div>
            </div>

            <div className="relative flex-1 overflow-auto p-3 sm:p-4">
              {selectedProject && !selectedProject.imported ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-sm text-foreground"><p className="font-medium">Сначала импортируйте проект в Roadmap</p><p className="mt-1 text-muted-foreground">Роли сохраняются отдельно для проекта «{selectedProject.name}».</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Открыть план проекта</Link></div>
                : !selectedProject && !projectsQuery.isLoading ? <div className="px-2 py-10 text-center"><p className="text-sm font-medium text-foreground">Нет проектов</p><p className="mt-1 text-sm text-muted-foreground">Импортируйте проект из Azure DevOps, чтобы добавить в него роли.</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Перейти к планированию</Link></div>
                : rolesQuery.isLoading ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">Загружаем роли…</p>
                : roles.length || pendingTemplates.length ? <ul className="grid gap-2 sm:grid-cols-2" aria-label="Роли проекта">
                  {roles.map((role) => {
                    const removing = removingIds.includes(role.id);
                    const active = selectedId === role.id;
                    if (confirmingId === role.id) return <li key={role.id} onKeyDown={(event) => { if (event.key === 'Escape') setConfirmingId(''); }} className="flex min-w-0 flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <RoleMark name={role.name} color={role.color} size="sm" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">Убрать «{role.name}»?</span><span className="block text-xs text-muted-foreground">{membersLabel(role.members?.length ?? 0)} будут отвязаны от роли</span></span>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <Button type="button" variant="ghost" size="sm" className="h-8" autoFocus onClick={() => setConfirmingId('')}>Отмена</Button>
                        <Button type="button" variant="destructive" size="sm" className="h-8" onClick={() => confirmRemove(role.id)}>Убрать</Button>
                      </div>
                    </li>;
                    return <li key={role.id}
                      draggable={!removing}
                      onDragStart={(event) => startDrag(event, { kind: 'projectRole', id: role.id })}
                      onDragEnd={endDrag}
                      className={`group relative flex min-w-0 select-none items-center rounded-lg border bg-background transition-all ${active ? 'border-primary/50 ring-2 ring-primary/15' : 'border-border hover:border-primary/30'} ${removing ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'} ${dragging?.kind === 'projectRole' && dragging.id === role.id ? 'opacity-40' : ''}`}
                     >
                      <div role="button" tabIndex={0} onClick={() => switchRole(role.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); switchRole(role.id); } }} aria-current={active ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
                        <RoleMark name={role.name} color={role.color} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{role.name}{role.isMock ? <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{role.members?.length ? membersLabel(role.members.length) : 'Нет участников'}</span></span>
                      </div>
                      <button type="button" aria-label={`Убрать роль «${role.name}» из проекта`} title="Убрать из проекта" disabled={removing} onClick={() => requestRemove(role)} className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">{removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</button>
                    </li>;
                  })}
                  {pendingTemplates.map((template) => <li key={`pending-${template.id}`} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 opacity-70">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    <RoleMark name={template.name} color={template.color} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{template.name}</span>
                  </li>)}
                  {projectActive ? <li className="flex min-h-[58px] items-center justify-center rounded-lg border-2 border-dashed border-primary/40 text-xs font-medium text-primary">Отпустите здесь</li> : null}
                </ul>
                : <div className={`flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 text-center transition-colors ${projectActive ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground'}`}>
                  <ArrowRight className="h-7 w-7 opacity-60" />
                  <p className="mt-3 text-sm font-medium text-foreground">Перетащите роли из каталога сюда</p>
                  <p className="mt-1 text-xs">Или нажмите на стрелку у роли слева.</p>
                </div>}
            </div>
          </div>
        </section>

        {canEditProject ? selectedRole ? <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-base font-semibold text-foreground">Участники и настройки роли</h2><p className="mt-0.5 text-xs text-muted-foreground">Выберите роль, отметьте людей и сохраните.</p></div>
              {dirty ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Есть изменения</span> : null}
            </div>
            <div role="tablist" aria-label="Роль для настройки" className="mt-4 flex flex-wrap gap-2">
              {roles.map((role) => {
                const active = role.id === selectedId;
                const label = active ? name || role.name : role.name;
                return <button key={role.id} type="button" role="tab" aria-selected={active} onClick={() => switchRole(role.id)} className={`inline-flex h-10 max-w-64 items-center gap-2 rounded-lg border pl-1.5 pr-3 text-sm transition-colors ${active ? 'border-primary/50 bg-primary/10 font-medium text-foreground ring-2 ring-primary/15' : pendingSwitchId === role.id ? 'border-amber-500/50 bg-amber-500/5 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}>
                  <RoleMark name={label} color={active ? color : role.color} size="sm" />
                  <span className="min-w-0 truncate">{label}</span>
                  <span className={`shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{active ? memberIds.length : role.members?.length ?? 0}</span>
                </button>;
              })}
            </div>
            {pendingSwitchRole ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <p className="text-sm text-foreground">Изменения роли «{selectedRole.name}» не сохранены. Перейти к «{pendingSwitchRole.name}»?</p>
              <div className="flex gap-1.5">
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setPendingSwitchId('')}>Остаться</Button>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={discardAndSwitch}>Не сохранять</Button>
                <Button type="button" size="sm" className="h-8" disabled={save.isPending || !name.trim()} onClick={saveAndSwitch}>{save.isPending ? 'Сохранение…' : 'Сохранить и перейти'}</Button>
              </div>
            </div> : null}
          </div>

          <div className="space-y-6 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="text-sm font-medium text-foreground">Название<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Название роли" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></label>
              <fieldset className="min-w-0"><legend className="text-sm font-medium text-foreground">Цвет</legend><div className="mt-2 flex items-center gap-3">
                <label title="Выбрать цвет" className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/10 shadow-sm transition hover:scale-110 hover:shadow-md focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2" style={{ backgroundColor: color }}>
                  <Pipette className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]" />
                  <input type="color" aria-label="Выбрать свой цвет" value={color} onChange={(event) => setColor(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
                <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{color}</span>
              </div></fieldset>
            </div>

            <div className="border-t border-border pt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-foreground">Участники роли <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{memberIds.length}</span></h3><p className="mt-1 text-xs text-muted-foreground">Выберите людей, которых можно назначать на фичи этой роли.</p></div>
                {people.length ? <div className="flex gap-3 text-xs"><button type="button" onClick={selectVisible} className="font-medium text-primary hover:underline">Выбрать видимых</button><button type="button" onClick={clearVisible} className="text-muted-foreground hover:text-foreground">Очистить</button></div> : null}
              </div>

              {peopleQuery.isLoading ? <div className="mt-4 rounded-lg bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">Загружаем участников…</div> : people.length ? (
                <>
                  <label className="relative mt-4 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти по имени или почте" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
                  <div className="mt-3 max-h-[360px] divide-y divide-border overflow-auto rounded-lg border border-border">
                    {visiblePeople.length ? visiblePeople.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40">
                      <input type="checkbox" checked={memberIds.includes(person.id)} onChange={() => togglePerson(person.id)} className="h-4 w-4 rounded accent-primary" />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('ru-RU')}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{person.name}{person.isMock ? <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{person.email ?? 'Email не указан'}</span></span>
                      {memberIds.includes(person.id) ? <Check className="h-4 w-4 text-primary" /> : null}
                    </label>) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ничего не найдено.</p>}
                  </div>
                </>
              ) : <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center sm:flex-row sm:text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm"><Users className="h-5 w-5" /></span>
                <div className="mt-3 flex-1 sm:ml-4 sm:mt-0"><p className="text-sm font-medium text-foreground">Список участников пока пуст</p><p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">Синхронизируйте пользователей Azure DevOps. После синхронизации здесь появится список для назначения этой роли.</p></div>
                <Link href={routes.roadmapAdminUsers} className="mt-4 inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:ml-4 sm:mt-0">Открыть пользователей</Link>
              </div>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
            <p className="text-xs text-muted-foreground">{dirty ? 'Изменения ещё не сохранены.' : `Назначено участников: ${memberIds.length}`}</p>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || !dirty} className="gap-2"><Save className="h-4 w-4" />{save.isPending ? 'Сохранение…' : 'Сохранить изменения'}</Button>
          </div>
        </section> : roles.length ? <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center"><ShieldCheck className="h-7 w-7 text-muted-foreground/60" /><p className="mt-2 text-sm text-muted-foreground">Добавьте роль в проект, чтобы настроить её участников.</p></div> : null : null}
      </div>
    </main>
  );
}
