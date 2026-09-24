'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Pipette, Plus, Save, Search, ShieldCheck, Users, X } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';

export function RoadmapRolesPage() {
  const client = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const projects = projectsQuery.data?.data ?? [];
  const catalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog });
  const catalog = catalogQuery.data ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const roadmapProjectId = selectedProject?.roadmapId ?? '';
  const rolesQuery = useQuery({
    queryKey: ['roadmap', 'admin', 'roles', roadmapProjectId],
    queryFn: () => roadmapApi.adminRoles(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const roles = rolesQuery.data ?? [];
  const people = (peopleQuery.data ?? []).filter((person) => person.isActive);
  const [selectedId, setSelectedId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [showTemplateCreate, setShowTemplateCreate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const selectedRole = roles.find((role) => role.id === selectedId);
  const selectedRoleMemberIds = selectedRole?.members?.map((member) => member.personExternalId) ?? [];
  const visiblePeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    if (!term) return people;
    return people.filter((person) => `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term));
  }, [people, search]);
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
  }, [selectedRole]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'role-catalog'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles', roadmapProjectId] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
      client.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () => roadmapApi.createRole(roadmapProjectId, newRoleName.trim()),
    onSuccess: async (role) => {
      setNewRoleName('');
      setShowCreate(false);
      await refresh();
      setSelectedId(role.id);
    },
  });
  const createTemplate = useMutation({
    mutationFn: () => roadmapApi.createRoleTemplate(newTemplateName.trim()),
    onSuccess: async () => {
      setNewTemplateName('');
      setShowTemplateCreate(false);
      await refresh();
    },
  });
  const addFromCatalog = useMutation({
    mutationFn: ({ projectId, templateId }: { projectId: string; templateId: string }) => roadmapApi.addRoleFromCatalog(projectId, templateId),
    onSuccess: async (role) => {
      await refresh();
      setSelectedId(role.id);
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!selectedRole) return;
      await roadmapApi.updateRole(selectedRole.id, { name: name.trim(), color });
      await roadmapApi.setRoleMembers(selectedRole.id, memberIds);
    },
    onSuccess: refresh,
  });

  const error = projectsQuery.error ?? catalogQuery.error ?? rolesQuery.error ?? peopleQuery.error ?? create.error ?? createTemplate.error ?? addFromCatalog.error ?? save.error;
  const togglePerson = (id: string) => setMemberIds((current) => current.includes(id) ? current.filter((personId) => personId !== id) : [...current, id]);
  const selectVisible = () => setMemberIds((current) => [...new Set([...current, ...visiblePeople.map((person) => person.id)])]);
  const clearVisible = () => setMemberIds((current) => current.filter((id) => !visiblePeople.some((person) => person.id === id)));

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Роли и участники</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AzureProjectPicker projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} disabled={projectsQuery.isLoading} placeholder="Выбрать проект" />
            <Link href={routes.roadmapAdminUsers} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Users className="h-4 w-4" />Пользователи</Link>
            <Button disabled={!roadmapProjectId} onClick={() => { setShowCreate((open) => !open); create.reset(); }} className="gap-2"><Plus className="h-4 w-4" />Создать роль</Button>
          </div>
        </div>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error instanceof Error ? error.message : 'Не удалось сохранить изменения'}</div> : null}

        {selectedProject && !selectedProject.imported ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-sm text-foreground"><p className="font-medium">Сначала импортируйте проект в Roadmap</p><p className="mt-1 text-muted-foreground">Роли будут сохранены отдельно для проекта «{selectedProject.name}».</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Открыть план проекта</Link></div> : null}
        {!selectedProject && !projectsQuery.isLoading ? <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center"><p className="text-sm font-medium text-foreground">Нет импортированных проектов</p><p className="mt-1 text-sm text-muted-foreground">Импортируйте проект из Azure DevOps, после этого здесь можно будет настроить его роли.</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Перейти к планированию</Link></div> : null}

        {showCreate ? (
          <form onSubmit={(event) => { event.preventDefault(); if (newRoleName.trim()) create.mutate(); }} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
            <label htmlFor="new-roadmap-role" className="min-w-56 flex-1 text-sm font-medium text-foreground">Название роли
              <input id="new-roadmap-role" autoFocus value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Например, Backend-разработчик" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <div className="ml-auto flex gap-2"><Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setNewRoleName(''); }}><X className="h-4 w-4" />Отмена</Button><Button type="submit" disabled={!newRoleName.trim() || create.isPending}><Plus className="h-4 w-4" />{create.isPending ? 'Создание…' : 'Добавить роль'}</Button></div>
          </form>
        ) : null}

        <details className="group overflow-hidden rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-medium text-muted-foreground">Шаблоны ролей <span className="ml-1 text-xs">{catalog.length}</span></span>
            <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">Готовые роли для повторного использования в проектах.</p>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => { setShowTemplateCreate((open) => !open); createTemplate.reset(); }}>Создать шаблон</Button>
          </div>
          {showTemplateCreate ? <form onSubmit={(event) => { event.preventDefault(); if (newTemplateName.trim()) createTemplate.mutate(); }} className="flex flex-wrap items-end gap-2 border-b border-border p-3">
            <label htmlFor="new-role-template" className="min-w-52 flex-1 text-xs font-medium text-foreground">Название шаблона
              <input id="new-role-template" autoFocus value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Например, Аналитик" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowTemplateCreate(false); setNewTemplateName(''); }}><X className="h-4 w-4" />Отмена</Button>
            <Button type="submit" size="sm" disabled={!newTemplateName.trim() || createTemplate.isPending}><Plus className="h-4 w-4" />{createTemplate.isPending ? 'Создание…' : 'Создать'}</Button>
          </form> : null}
          {catalogQuery.isLoading ? <p className="px-4 py-6 text-sm text-muted-foreground">Загружаем каталог…</p> : catalog.length ? (
            <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.map((template) => {
                const added = roles.some((role) => role.name === template.name);
                return <div key={template.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: template.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{template.name}</span>
                  {template.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}
                  {added ? <span className="shrink-0 text-xs text-muted-foreground">В проекте</span> : <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1 px-2 text-xs" disabled={!roadmapProjectId || addFromCatalog.isPending} onClick={() => addFromCatalog.mutate({ projectId: roadmapProjectId, templateId: template.id })}><Plus className="h-3.5 w-3.5" />Добавить</Button>}
                </div>;
              })}
            </div>
          ) : <div className="px-4 py-7 text-center"><p className="text-sm font-medium text-foreground">Шаблонов пока нет</p><p className="mt-1 text-xs text-muted-foreground">Можно создать шаблон здесь или добавить обычную роль напрямую в проект.</p></div>}
          {!roadmapProjectId && catalog.length ? <p className="border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">Выберите импортированный проект сверху, чтобы добавить в него роли.</p> : null}
        </details>

        {roadmapProjectId ? <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div><h2 className="text-sm font-semibold text-foreground">Роли проекта</h2><p className="mt-0.5 max-w-48 truncate text-xs text-muted-foreground">{selectedProject?.name} · {roles.length} ролей</p></div>
              <Button variant="ghost" size="icon" aria-label="Создать роль" className="h-8 w-8" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /></Button>
            </div>
            {rolesQuery.isLoading ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">Загружаем роли…</div> : roles.length ? (
              <nav className="space-y-1 p-2" aria-label="Список ролей">
                {roles.map((role) => <button key={role.id} type="button" onClick={() => setSelectedId(role.id)} aria-current={selectedId === role.id ? 'true' : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selectedId === role.id ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/70'}`}>
                  <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-background" style={{ backgroundColor: role.color }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{role.name}{role.isMock ? <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{role.members?.length ?? 0} участников</span></span>
                  {selectedId === role.id ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                </button>)}
              </nav>
            ) : <div className="px-4 py-8 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-muted-foreground/70" /><p className="mt-2 text-sm font-medium text-foreground">В проекте пока нет ролей</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Создайте роль или добавьте готовый шаблон.</p></div>}
          </aside>

          <div className="min-w-0">
            {selectedRole ? <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3"><span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color }} /><div><h2 className="text-base font-semibold text-foreground">Настройки роли</h2><p className="mt-0.5 text-xs text-muted-foreground">Изменения сохраняются после нажатия кнопки внизу.</p></div></div>
                {dirty ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Есть изменения</span> : null}
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
            </section> : <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center"><ShieldCheck className="h-8 w-8 text-muted-foreground/60" /><h2 className="mt-3 text-sm font-semibold text-foreground">Выберите роль</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Выберите роль слева, чтобы настроить её цвет и состав участников.</p></div>}
          </div>
        </section> : null}
      </div>
    </main>
  );
}
