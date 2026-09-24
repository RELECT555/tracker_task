'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, FolderKanban, Layers3, Pipette, Plus, Save, Search, ShieldCheck, Users, X } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { ColorMark } from '@/shared/ui/color-mark';

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
  const [section, setSection] = useState<'catalog' | 'project'>('catalog');
  const [selectedId, setSelectedId] = useState('');
  const [showAddCatalog, setShowAddCatalog] = useState(false);
  const [showTemplateCreate, setShowTemplateCreate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const selectedRole = roles.find((role) => role.id === selectedId);
  const selectedRoleMemberIds = useMemo(() => selectedRole?.members?.map((member) => member.personExternalId) ?? [], [selectedRole?.members]);
  const visiblePeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    if (!term) return people;
    return people.filter((person) => `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term));
  }, [people, search]);
  const visibleCatalog = useMemo(() => {
    const term = catalogSearch.trim().toLocaleLowerCase('ru-RU');
    return term ? catalog.filter((role) => role.name.toLocaleLowerCase('ru-RU').includes(term)) : catalog;
  }, [catalog, catalogSearch]);
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

  const error = (section === 'catalog' ? catalogQuery.error : projectsQuery.error ?? catalogQuery.error ?? rolesQuery.error ?? peopleQuery.error) ?? createTemplate.error ?? addFromCatalog.error ?? save.error;
  const togglePerson = (id: string) => setMemberIds((current) => current.includes(id) ? current.filter((personId) => personId !== id) : [...current, id]);
  const selectVisible = () => setMemberIds((current) => [...new Set([...current, ...visiblePeople.map((person) => person.id)])]);
  const clearVisible = () => setMemberIds((current) => current.filter((id) => !visiblePeople.some((person) => person.id === id)));

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Роли</h1><p className="mt-1 text-sm text-muted-foreground">Каталог ролей и состав команды по проектам</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {section === 'project' ? <AzureProjectPicker projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} disabled={projectsQuery.isLoading} placeholder="Выбрать проект" /> : null}
            <Link href={routes.roadmapAdminUsers} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Users className="h-4 w-4" />Пользователи</Link>
          </div>
        </div>

        <nav className="flex w-fit gap-1 rounded-xl border border-border bg-muted/50 p-1" aria-label="Разделы ролей">
          <button type="button" onClick={() => setSection('catalog')} aria-current={section === 'catalog' ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${section === 'catalog' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground'}`}><Layers3 className="h-4 w-4" />Каталог <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{catalog.length}</span></button>
          <button type="button" onClick={() => setSection('project')} aria-current={section === 'project' ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${section === 'project' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground'}`}><FolderKanban className="h-4 w-4" />Роли проекта</button>
        </nav>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error instanceof Error ? error.message : 'Не удалось сохранить изменения'}</div> : null}

        {section === 'catalog' ? <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
            <div><div className="flex items-center gap-2"><h2 className="text-base font-semibold text-foreground">Каталог ролей</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{catalog.length}</span></div><p className="mt-1 text-sm text-muted-foreground">Создайте роль один раз и добавляйте её в проекты.</p></div>
            <Button type="button" onClick={() => { setShowTemplateCreate((open) => !open); createTemplate.reset(); }} className="h-10 gap-2 px-4"><Plus className="h-4 w-4" />Создать роль</Button>
          </div>
          {showTemplateCreate ? <form onSubmit={(event) => { event.preventDefault(); if (newTemplateName.trim()) createTemplate.mutate(); }} className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/20 p-4 sm:px-6">
            <label htmlFor="new-role-template" className="min-w-52 flex-1 text-sm font-medium text-foreground">Новая роль
              <input id="new-role-template" autoFocus value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Например, Аналитик" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <Button type="button" variant="ghost" onClick={() => { setShowTemplateCreate(false); setNewTemplateName(''); }}><X className="h-4 w-4" />Отмена</Button>
            <Button type="submit" disabled={!newTemplateName.trim() || createTemplate.isPending}><Plus className="h-4 w-4" />{createTemplate.isPending ? 'Создание…' : 'Создать роль'}</Button>
          </form> : null}
          {catalog.length > 4 ? <div className="border-b border-border px-5 py-3 sm:px-6"><label className="relative block max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Найти роль" aria-label="Найти роль в каталоге" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20" /></label></div> : null}
          {catalogQuery.isLoading ? <p className="px-5 py-8 text-sm text-muted-foreground sm:px-6">Загружаем каталог…</p> : catalog.length ? visibleCatalog.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleCatalog.map((template) => <div key={template.id} className="group flex min-h-[68px] min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/40" style={{ borderLeftWidth: 3, borderLeftColor: template.color }}>
              <ColorMark color={template.color} size="md" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{template.name}</span>
              {template.isMock ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">демо</span> : null}
            </div>)}
          </div> : <div className="px-5 py-10 text-center text-sm text-muted-foreground">Роли по запросу «{catalogSearch}» не найдены.</div> : <div className="px-5 py-12 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-medium text-foreground">Каталог пока пуст</p><p className="mt-1 text-sm text-muted-foreground">Создайте первую роль, чтобы добавить её в проект.</p></div>}
        </section> : <>
          {selectedProject && !selectedProject.imported ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-sm text-foreground"><p className="font-medium">Сначала импортируйте проект в Roadmap</p><p className="mt-1 text-muted-foreground">Роли будут сохранены отдельно для проекта «{selectedProject.name}».</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Открыть план проекта</Link></div> : null}
          {!selectedProject && !projectsQuery.isLoading ? <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center"><p className="text-sm font-medium text-foreground">Нет проектов</p><p className="mt-1 text-sm text-muted-foreground">Импортируйте проект из Azure DevOps, чтобы добавить в него роли.</p><Link href={routes.roadmap} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Перейти к планированию</Link></div> : null}
          {roadmapProjectId ? <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><h2 className="text-base font-semibold text-foreground">Наполнение проекта ролями</h2><p className="mt-1 text-sm text-muted-foreground">{selectedProject?.name} · выберите роли из каталога и назначьте участников.</p></div><Button type="button" variant="outline" onClick={() => setShowAddCatalog((open) => !open)} className="gap-2"><Plus className="h-4 w-4" />Добавить роли</Button></div>
            {showAddCatalog ? <div className="grid gap-2 border-b border-border bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-3">{catalog.length ? catalog.map((template) => { const added = roles.some((role) => role.name === template.name); return <div key={template.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5"><ColorMark color={template.color} size="md" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{template.name}</span>{added ? <span className="shrink-0 text-xs text-muted-foreground">Уже добавлена</span> : <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1 px-2 text-xs" disabled={addFromCatalog.isPending} onClick={() => addFromCatalog.mutate({ projectId: roadmapProjectId, templateId: template.id })}><Plus className="h-3.5 w-3.5" />Добавить</Button>}</div>; }) : <div className="col-span-full rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center"><p className="text-sm text-muted-foreground">Каталог пока пуст.</p><button type="button" onClick={() => setSection('catalog')} className="mt-2 text-sm font-medium text-primary hover:underline">Создать первую роль</button></div>}</div> : null}
        </section> : null}

        {roadmapProjectId ? <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div><h2 className="text-sm font-semibold text-foreground">Роли проекта</h2><p className="mt-0.5 max-w-48 truncate text-xs text-muted-foreground">{selectedProject?.name} · {roles.length} ролей</p></div>
              <span className="text-xs text-muted-foreground">{roles.length}</span>
            </div>
            {rolesQuery.isLoading ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">Загружаем роли…</div> : roles.length ? (
              <nav className="space-y-1 p-2" aria-label="Список ролей">
                {roles.map((role) => <button key={role.id} type="button" onClick={() => setSelectedId(role.id)} aria-current={selectedId === role.id ? 'true' : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selectedId === role.id ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/70'}`}>
                  <ColorMark color={role.color} size="md" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{role.name}{role.isMock ? <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{role.members?.length ?? 0} участников</span></span>
                  {selectedId === role.id ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                </button>)}
              </nav>
            ) : <div className="px-4 py-8 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-muted-foreground/70" /><p className="mt-2 text-sm font-medium text-foreground">В проекте пока нет ролей</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Добавьте роли из каталога выше.</p></div>}
          </aside>

          <div className="min-w-0">
            {selectedRole ? <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3"><ColorMark color={color} size="md" /><div><h2 className="text-base font-semibold text-foreground">Настройки роли</h2><p className="mt-0.5 text-xs text-muted-foreground">Изменения сохраняются после нажатия кнопки внизу.</p></div></div>
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
        </>}
      </div>
    </main>
  );
}
