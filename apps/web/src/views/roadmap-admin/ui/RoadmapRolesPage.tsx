'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Plus, Search, ShieldCheck, Users, X } from 'lucide-react';
import { roadmapApi, type RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { RoleMark } from '@/shared/ui/color-mark';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

function membersLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'участник' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'участника' : 'участников';
  return `${count} ${word}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('ru-RU');
}

const demoBadge = <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span>;

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
  const [addOpen, setAddOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
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
  const catalogTerm = catalogSearch.trim();
  const addableTemplates = useMemo(() => {
    const term = catalogTerm.toLocaleLowerCase('ru-RU');
    return catalog.filter((template) => !projectRoleNames.has(template.name) && !pendingTemplateIds.includes(template.id) && template.name.toLocaleLowerCase('ru-RU').includes(term));
  }, [catalog, catalogTerm, projectRoleNames, pendingTemplateIds]);
  // Новую роль в каталоге создаём, только если такого названия ещё нет.
  const canCreateTemplate = Boolean(catalogTerm) && !catalog.some((template) => template.name.toLocaleLowerCase('ru-RU') === catalogTerm.toLocaleLowerCase('ru-RU'));
  const pendingTemplates = catalog.filter((template) => pendingTemplateIds.includes(template.id) && !projectRoleNames.has(template.name));
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
  const resetForm = () => {
    if (!selectedRole) return;
    setName(selectedRole.name);
    setColor(selectedRole.color);
    setMemberIds(selectedRoleMemberIds);
  };

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'role-catalog'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles', roadmapProjectId] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
    ]);
  };
  const addFromCatalog = useMutation({
    mutationFn: (templateId: string) => roadmapApi.addRoleFromCatalog(roadmapProjectId, templateId),
    onMutate: (templateId) => setPendingTemplateIds((current) => [...current, templateId]),
    onSuccess: async (added) => {
      await refresh();
      switchRole(added.id);
    },
    onSettled: async (_data, error, templateId) => {
      if (error) await refresh();
      setPendingTemplateIds((current) => current.filter((id) => id !== templateId));
    },
  });
  const createTemplate = useMutation({
    mutationFn: (templateName: string) => roadmapApi.createRoleTemplate(templateName),
    onSuccess: (template) => addFromCatalog.mutate(template.id),
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

  const closeAdd = () => {
    setAddOpen(false);
    setCatalogSearch('');
  };
  const addTemplate = (templateId: string) => {
    closeAdd();
    addFromCatalog.mutate(templateId);
  };
  const createAndAdd = () => {
    if (!canCreateTemplate || createTemplate.isPending) return;
    closeAdd();
    createTemplate.mutate(catalogTerm);
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

  const notice = selectedProject && !selectedProject.imported
    ? <><p className="text-sm font-medium text-foreground">Сначала импортируйте проект в Roadmap</p><p className="mt-1 text-sm text-muted-foreground">Роли сохраняются отдельно для проекта «{selectedProject.name}».</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Открыть план проекта</Link></>
    : !selectedProject && !projectsQuery.isLoading
      ? <><p className="text-sm font-medium text-foreground">Нет проектов</p><p className="mt-1 text-sm text-muted-foreground">Импортируйте проект из Azure DevOps, чтобы добавить в него роли.</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Перейти к планированию</Link></>
      : null;

  const addPopover = <Popover open={addOpen} onOpenChange={(open) => open ? setAddOpen(true) : closeAdd()}>
    <PopoverTrigger asChild>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2.5"><Plus className="h-4 w-4" />Добавить</Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-72 overflow-hidden rounded-xl p-0">
      <form onSubmit={(event) => { event.preventDefault(); if (addableTemplates.length === 1) addTemplate(addableTemplates[0].id); else createAndAdd(); }} className="border-b border-border p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Найти или создать роль" aria-label="Найти или создать роль" className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
        </label>
      </form>
      <div className="max-h-64 overflow-y-auto p-1.5">
        {addableTemplates.map((template) => <button key={template.id} type="button" onClick={() => addTemplate(template.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted">
          <RoleMark name={template.name} color={template.color} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{template.name}{template.isMock ? demoBadge : null}</span>
        </button>)}
        {canCreateTemplate ? <button type="button" onClick={createAndAdd} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-primary transition-colors hover:bg-primary/10">
          <Plus className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Создать роль «{catalogTerm}»</span>
        </button> : null}
        {!addableTemplates.length && !canCreateTemplate ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">{catalogTerm ? 'Эта роль уже в проекте' : 'Все роли уже добавлены. Введите название, чтобы создать новую.'}</p> : null}
      </div>
    </PopoverContent>
  </Popover>;

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Роли</h1><p className="mt-1 text-sm text-muted-foreground">Роли проекта и люди, которых можно на них назначать</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <AzureProjectPicker projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} disabled={projectsQuery.isLoading} placeholder="Выбрать проект" />
            <Link href={routes.roadmapAdminUsers} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Users className="h-4 w-4" />Пользователи</Link>
          </div>
        </div>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error instanceof Error ? error.message : 'Не удалось сохранить изменения'}</div> : null}

        {notice ? <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">{notice}</div> : (
          <section className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Роли проекта <span className="ml-1 font-normal tabular-nums text-muted-foreground">{roles.length}</span></h2>
                {roadmapProjectId ? addPopover : null}
              </div>
              {rolesQuery.isLoading || projectsQuery.isLoading ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Загружаем роли…</p>
                : roles.length || pendingTemplates.length ? <ul className="p-1.5" aria-label="Роли проекта">
                  {roles.map((role) => {
                    const removing = removingIds.includes(role.id);
                    const active = selectedId === role.id;
                    const label = active ? name || role.name : role.name;
                    if (confirmingId === role.id) return <li key={role.id} onKeyDown={(event) => { if (event.key === 'Escape') setConfirmingId(''); }} className="rounded-lg bg-destructive/5 px-2.5 py-2">
                      <p className="text-sm text-foreground">Убрать «{role.name}»? {membersLabel(role.members?.length ?? 0)} будут отвязаны.</p>
                      <div className="mt-2 flex justify-end gap-1.5">
                        <Button type="button" variant="ghost" size="sm" className="h-7" autoFocus onClick={() => setConfirmingId('')}>Отмена</Button>
                        <Button type="button" variant="destructive" size="sm" className="h-7" onClick={() => confirmRemove(role.id)}>Убрать</Button>
                      </div>
                    </li>;
                    return <li key={role.id} className={`group flex items-center rounded-lg transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted/60'} ${removing ? 'opacity-40' : ''}`}>
                      <button type="button" onClick={() => switchRole(role.id)} aria-current={active ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                        <RoleMark name={label} color={active ? color : role.color} size="sm" />
                        <span className={`min-w-0 flex-1 truncate text-sm text-foreground ${active ? 'font-medium' : ''}`}>{label}{role.isMock ? demoBadge : null}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{active ? memberIds.length : role.members?.length ?? 0}</span>
                      </button>
                      <button type="button" aria-label={`Убрать роль «${role.name}» из проекта`} title="Убрать из проекта" disabled={removing} onClick={() => requestRemove(role)} className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">{removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}</button>
                    </li>;
                  })}
                  {pendingTemplates.map((template) => <li key={`pending-${template.id}`} className="flex items-center gap-2.5 px-2.5 py-2 opacity-60">
                    <RoleMark name={template.name} color={template.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{template.name}</span>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  </li>)}
                </ul>
                : <div className="px-4 py-10 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-muted-foreground/60" /><p className="mt-2 text-sm text-muted-foreground">В проекте пока нет ролей.<br />Нажмите «Добавить».</p></div>}
            </div>

            {selectedRole ? <div className="overflow-hidden rounded-xl border border-border bg-card">
              {pendingSwitchRole ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
                <p className="text-sm text-foreground">Сохранить изменения перед переходом к «{pendingSwitchRole.name}»?</p>
                <div className="flex gap-1.5">
                  <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setPendingSwitchId('')}>Остаться</Button>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={discardAndSwitch}>Не сохранять</Button>
                  <Button type="button" size="sm" className="h-8" disabled={save.isPending || !name.trim()} onClick={saveAndSwitch}>Сохранить</Button>
                </div>
              </div> : null}

              <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                <label title="Цвет роли" className="relative h-8 w-8 shrink-0 cursor-pointer rounded-full border border-black/10 shadow-sm transition hover:scale-105 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2" style={{ backgroundColor: color }}>
                  <input type="color" aria-label="Цвет роли" value={color} onChange={(event) => setColor(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
                <input aria-label="Название роли" value={name} onChange={(event) => setName(event.target.value)} placeholder="Название роли" className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-base font-semibold text-foreground outline-none transition-colors hover:border-input focus:border-input focus:ring-2 focus:ring-primary/30" />
              </div>

              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Участники <span className="ml-1 font-normal tabular-nums text-muted-foreground">{memberIds.length} из {people.length}</span></h3>
                  {people.length ? <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                    <div className="flex gap-3 text-xs"><button type="button" onClick={selectVisible} className="font-medium text-primary hover:underline">Выбрать всех</button><button type="button" onClick={clearVisible} className="text-muted-foreground hover:text-foreground">Снять всех</button></div>
                    <label className="relative block w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти по имени или почте" aria-label="Найти участника" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
                  </div> : null}
                </div>

                {peopleQuery.isLoading ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Загружаем участников…</p> : people.length ? <>
                  {visiblePeople.length ? <div className="mt-3 grid max-h-[460px] grid-cols-1 content-start gap-2 overflow-auto p-0.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {visiblePeople.map((person) => {
                      const checked = memberIds.includes(person.id);
                      return <label key={person.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/25 hover:bg-muted/40'}`}>
                        <input type="checkbox" checked={checked} onChange={() => togglePerson(person.id)} className="sr-only" />
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${checked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {checked ? <Check className="h-4 w-4" /> : initials(person.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5"><span className={`truncate text-sm text-foreground ${checked ? 'font-medium' : ''}`}>{person.name}</span>{person.isMock ? <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}</span>
                          {person.email ? <span className="block truncate text-xs text-muted-foreground">{person.email}</span> : null}
                        </span>
                      </label>;
                    })}
                  </div> : <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ничего не найдено.</p>}
                </> : <div className="mt-4 rounded-lg border border-dashed border-border px-5 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">Список пользователей пуст</p>
                  <p className="mt-1 text-xs text-muted-foreground">Синхронизируйте пользователей Azure DevOps, чтобы назначать их на роли.</p>
                  <Link href={routes.roadmapAdminUsers} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Открыть пользователей</Link>
                </div>}
              </div>

              {dirty ? <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
                <Button type="button" variant="ghost" onClick={() => { resetForm(); setPendingSwitchId(''); }}>Отменить</Button>
                <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>{save.isPending ? 'Сохранение…' : 'Сохранить'}</Button>
              </div> : null}
            </div> : null}
          </section>
        )}
      </div>
    </main>
  );
}
