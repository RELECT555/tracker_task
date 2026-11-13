'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, Building2, ChevronDown, ChevronRight, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { roadmapApi, type RoadmapPerson, type RoadmapRole, type RoadmapRoleTemplate } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RoleMark } from '@/shared/ui/color-mark';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { AdminAlert, AdminPage, AdminPageHeader } from './AdminLayout';
import { ProjectCatalogPanel } from './integrations/ProjectCatalogPanel';

type RoleGroup = {
  key: string;
  label: RoadmapRoleTemplate;
  template?: RoadmapRoleTemplate;
  roles: RoadmapRole[];
};
type Selection = { groupKey: string; projectId: string };
type RoleDraft = { name: string; color: string; personId: string; memberIds: string[] };

const fieldClass = 'min-h-10 w-full min-w-0 rounded-lg border border-input bg-field px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';
const colorFieldClass = 'h-10 w-12 cursor-pointer rounded-lg border border-input bg-field p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const newRoleKey = '__new_role__';
const noPersonValue = '__no_person__';
const noProjectValue = '__no_project__';
const defaultColor = '#6366f1';
const plurals = new Intl.PluralRules('ru-RU');

function projectCount(count: number) {
  if (!count) return 'Без проекта';
  const form = plurals.select(count);
  return `${count} ${form === 'one' ? 'проект' : form === 'few' ? 'проекта' : 'проектов'}`;
}

function roleKey(name: string) {
  return name.trim().toLocaleLowerCase('ru-RU');
}

function groupRoles(catalog: RoadmapRoleTemplate[], projectRoles: RoadmapRole[]) {
  const groups = new Map<string, RoleGroup>();
  for (const template of catalog) {
    const key = roleKey(template.name);
    groups.set(key, { key, label: template, template, roles: [] });
  }
  for (const role of projectRoles) {
    const key = roleKey(role.name);
    const group = groups.get(key);
    if (group) group.roles.push(role);
    else groups.set(key, { key, label: role, roles: [role] });
  }
  return [...groups.values()].sort((a, b) => a.label.name.localeCompare(b.label.name, 'ru-RU'));
}

function AzureRoleMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary" title="Роль из Azure DevOps">
      <RefreshCw aria-hidden="true" className="size-3.5" />
      <span>Azure DevOps</span>
    </span>
  );
}

function RoleMembersPicker({ people, memberIds, defaultPersonId, role, disabled, onChange }: {
  people: RoadmapPerson[];
  memberIds: string[];
  defaultPersonId: string;
  role?: RoadmapRole;
  disabled: boolean;
  onChange: (memberIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const selected = new Set(memberIds);
  if (defaultPersonId) selected.add(defaultPersonId);
  const assignable = people.filter((person) => person.isActive !== false || selected.has(person.id));
  const term = roleKey(search);
  const visible = open ? assignable.filter((person) => roleKey(person.name).includes(term) || roleKey(person.email ?? '').includes(term)) : [];
  const preview = [...selected].slice(0, 4).map((id) => ({
    id,
    name: people.find((person) => person.id === id)?.name
      ?? role?.members?.find((person) => person.personExternalId === id)?.personName
      ?? (id === defaultPersonId ? role?.defaultPersonName : null)
      ?? 'Сотрудник',
  }));

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setSearch('');
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">
          {selected.size ? <>Участники <span className="ml-1 font-normal tabular-nums text-muted-foreground">{selected.size}</span></>
            : <span className="font-normal text-muted-foreground">Участников нет</span>}
        </h3>
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} className="-mr-2 px-2 text-primary">
              {selected.size ? 'Изменить состав' : 'Добавить участников'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Выбор участников"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-y-auto rounded-xl p-0"
            onOpenAutoFocus={(event) => { event.preventDefault(); searchInput.current?.focus(); }}
          >
            <div className="shrink-0 border-b border-border p-3">
              <label className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInput}
                  type="search"
                  aria-label="Поиск сотрудников"
                  placeholder="Найти по ФИО или почте"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={cn(fieldClass, 'pl-9')}
                />
              </label>
            </div>
            <fieldset disabled={disabled} className="roadmap-scrollbar relative max-h-60 min-h-24 min-w-0 flex-1 overflow-auto p-1.5">
              <legend className="sr-only">Сотрудники</legend>
              <div className="space-y-0.5">
                {visible.length ? visible.map((person) => (
                  <label key={person.id} className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(person.id)}
                      disabled={defaultPersonId === person.id}
                      onChange={(event) => onChange(event.target.checked
                        ? [...memberIds, person.id]
                        : memberIds.filter((id) => id !== person.id))}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1 break-words">
                      <span className="block">{person.name}</span>
                      {person.email && <span className="block text-xs text-muted-foreground">{person.email}</span>}
                    </span>
                    {defaultPersonId === person.id ? <span className="max-w-24 text-right text-xs text-muted-foreground">По умолчанию</span>
                      : person.isActive === false ? <span className="text-xs text-muted-foreground">Неактивен</span> : null}
                  </label>
                )) : <p role="status" className="px-2 py-3 text-sm text-muted-foreground">Сотрудники не найдены.</p>}
              </div>
            </fieldset>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Выбрано: {selected.size}</p>
              <Button type="button" size="sm" onClick={() => changeOpen(false)}>Готово</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {preview.length > 0 && (
        <ul aria-label="Выбранные участники" className="flex flex-wrap gap-1.5">
          {preview.map(({ id, name }) => <li key={id} className="max-w-full break-words rounded-md bg-muted px-2 py-1 text-xs">{name}</li>)}
          {selected.size > preview.length && <li className="px-1 py-1 text-xs text-muted-foreground">Ещё {selected.size - preview.length}</li>}
        </ul>
      )}
    </div>
  );
}

export function RoadmapRolesPage() {
  const client = useQueryClient();
  const fieldId = useId();
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const catalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog });
  const rolesQuery = useQuery({ queryKey: ['roadmap', 'admin', 'roles'], queryFn: () => roadmapApi.adminRoles() });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });

  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection>();
  const [pendingSelection, setPendingSelection] = useState<Selection>();
  const [draft, setDraft] = useState<Partial<RoleDraft>>({});
  const [importOpen, setImportOpen] = useState<boolean | null>(null);
  const [focusEditor, setFocusEditor] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [status, setStatus] = useState('');
  const importButton = useRef<HTMLButtonElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const unsavedPrompt = useRef<HTMLDivElement>(null);
  const navigationTrigger = useRef<HTMLElement>(null);

  const projects = new Map<string, string>();
  for (const project of projectsQuery.data?.data ?? []) {
    if (project.roadmapId) projects.set(project.roadmapId, project.name);
  }
  for (const projectRole of rolesQuery.data ?? []) {
    if (projectRole.projectId && projectRole.projectName && !projects.has(projectRole.projectId)) {
      projects.set(projectRole.projectId, projectRole.projectName);
    }
  }
  const people = peopleQuery.data ?? [];
  const activePeople = people.filter((person) => person.isActive !== false);
  const groups = groupRoles(catalogQuery.data ?? [], rolesQuery.data ?? []);
  const visibleGroups = groups.filter((group) => group.key.includes(roleKey(search)));
  const creating = selection?.groupKey === newRoleKey;
  const group = creating ? undefined : groups.find((entry) => entry.key === selection?.groupKey) ?? groups[0];
  const allowedProjects = (group && !group.template
    ? [...projects].filter(([id]) => group.roles.some((role) => role.projectId === id))
    : [...projects]).sort(([, left], [, right]) => left.localeCompare(right, 'ru-RU'));
  const linkedProjectIds = new Set(group?.roles.map((item) => item.projectId));
  const projectOptions = [
    ...(creating && allowedProjects.length ? [{ value: noProjectValue, label: 'Без проекта' }] : []),
    ...allowedProjects.map(([value, label]) => ({
      value,
      label,
      group: group?.template && group.roles.length ? linkedProjectIds.has(value) ? 'Роль уже добавлена' : 'Можно добавить' : undefined,
      leading: <Building2 aria-hidden="true" className="size-4" />,
    })).sort((left, right) => Number(linkedProjectIds.has(right.value)) - Number(linkedProjectIds.has(left.value))),
  ];
  const projectId = selection?.projectId || '';
  const selectedProjectId = creating && projectId === noProjectValue ? '' : allowedProjects.some(([id]) => id === projectId)
    ? projectId
    : group?.roles.find((role) => role.projectId && projects.has(role.projectId))?.projectId
      ?? (allowedProjects.length === 1 ? allowedProjects[0][0] : '');
  const role = group?.roles.find((entry) => entry.projectId === selectedProjectId);
  const roleName = role?.name ?? group?.label.name ?? '';
  const memberIds = role?.members?.map((member) => member.personExternalId) ?? [];
  const defaults: RoleDraft = {
    name: roleName,
    color: role?.color ?? group?.label.color ?? defaultColor,
    personId: role?.defaultPersonExternalId ?? '',
    memberIds,
  };
  const form = { ...defaults, ...draft };
  const dirty = form.name !== defaults.name || form.color !== defaults.color || form.personId !== defaults.personId
    || form.memberIds.length !== memberIds.length || form.memberIds.some((id) => !memberIds.includes(id));
  const nameTaken = creating && groups.some((entry) => entry.key === roleKey(form.name));

  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'role-catalog'] }),
    client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
    client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'users'] }),
    client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
    client.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
  ]);

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const defaultIsMember = form.personId && (memberIds.includes(form.personId) || activePeople.some((person) => person.id === form.personId));
      const assignment = {
        ...(form.personId !== defaults.personId && { personExternalId: form.personId || null }),
        ...(draft.memberIds && { personExternalIds: [...new Set([...form.memberIds, ...(defaultIsMember ? [form.personId] : [])])] }),
      };
      if (creating) {
        await roadmapApi.createRoleTemplate(name, form.color, selectedProjectId ? { projectId: selectedProjectId, ...assignment } : undefined);
        return;
      }
      if (role) {
        await roadmapApi.updateRole(role.id, {
          ...(name !== role.name && { name }),
          ...(form.color !== role.color && { color: form.color }),
          ...assignment,
        });
        return;
      }
      if (group?.template) await roadmapApi.addRoleFromCatalog(selectedProjectId, group.template.id, assignment);
    },
    onSuccess: async () => {
      await refresh();
      if (creating) setSearch('');
      setSelection({ groupKey: roleKey(form.name), projectId: selectedProjectId });
      setDraft({});
      setPendingSelection(undefined);
      setStatus(creating ? 'Роль создана.' : 'Изменения сохранены.');
      setFocusEditor(true);
    },
  });

  const remove = useMutation({
    mutationFn: (roleId: string) => roadmapApi.deleteRole(roleId),
    onSuccess: async () => {
      await refresh();
      setConfirmRemoval(false);
      setDraft({});
      setStatus('Роль убрана из проекта.');
      setFocusEditor(true);
    },
  });

  const pending = save.isPending || remove.isPending;
  const loading = catalogQuery.isLoading || rolesQuery.isLoading;
  const error = catalogQuery.error ?? rolesQuery.error;
  const mutationError = save.error ?? remove.error;
  const canSave = !pending && Boolean(form.name.trim()) && !nameTaken
    && (creating || (Boolean(selectedProjectId) && (role ? dirty : Boolean(group?.template))));
  const showFormActions = creating || (role ? dirty || save.isPending : Boolean(selectedProjectId));

  useEffect(() => {
    const showImport = () => {
      if (window.location.hash !== '#azure-role-import') return;
      setImportOpen(true);
      importButton.current?.focus();
    };
    showImport();
    window.addEventListener('hashchange', showImport);
    return () => window.removeEventListener('hashchange', showImport);
  }, []);

  useEffect(() => {
    if (!focusEditor || loading || pending) return;
    (creating ? nameInput.current : heading.current ?? createButton.current)?.focus();
    setFocusEditor(false);
  }, [creating, focusEditor, loading, pending]);

  useEffect(() => {
    if (pendingSelection) unsavedPrompt.current?.focus();
  }, [pendingSelection]);

  function select(next: Selection) {
    if (dirty) {
      navigationTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingSelection(next);
      return;
    }
    applySelection(next);
  }

  function applySelection(next: Selection) {
    setDraft({});
    setPendingSelection(undefined);
    setConfirmRemoval(false);
    save.reset();
    remove.reset();
    setStatus('');
    setSelection(next);
    setFocusEditor(true);
  }

  function openImport() {
    setImportOpen(true);
    importButton.current?.focus();
  }

  const activePersonId = form.personId && !activePeople.some((person) => person.id === form.personId)
    ? form.personId
    : '';
  const options = [
    ...(form.personId ? [{ value: noPersonValue, label: 'Снять назначение' }] : []),
    ...(activePersonId ? [{
      value: activePersonId,
      label: role?.defaultPersonName ?? 'Сотрудник',
      description: 'Неактивен',
    }] : []),
    ...activePeople.map((person) => ({ value: person.id, label: person.name, description: person.email, badge: person.isMock ? 'демо' : undefined })),
  ];
  const showEditor = creating || Boolean(group);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Роли"
        description="Назначайте сотрудников на роли в проектах Roadmap."
        actions={<>
          <Button ref={importButton} type="button" variant="outline" aria-expanded={importOpen === true} aria-controls="role-import-panel" onClick={() => setImportOpen((open) => !open)}>
            <ArrowDownToLine aria-hidden="true" className="size-4" /> Импорт из Azure
          </Button>
          <Button ref={createButton} type="button" disabled={pending || creating || loading || Boolean(error && !catalogQuery.data)} onClick={() => select({ groupKey: newRoleKey, projectId: selectedProjectId || noProjectValue })}>
            <Plus aria-hidden="true" className="size-4" /> Новая роль
          </Button>
        </>}
      />

      <div id="role-import-panel" hidden={!importOpen}>
        {importOpen !== null && <ProjectCatalogPanel inRoles onRolesImported={() => setSearch('')} />}
      </div>

      {error && <AdminAlert tone="error">
        <p>Не удалось загрузить роли. {error instanceof Error ? error.message : ''}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" disabled={catalogQuery.isFetching || rolesQuery.isFetching} onClick={() => void Promise.all([catalogQuery.refetch(), rolesQuery.refetch()])}>Повторить</Button>
      </AdminAlert>}
      {status && <AdminAlert tone="success">{status}</AdminAlert>}

      {loading ? <p role="status" className="text-sm text-muted-foreground">Загружаем роли…</p> : (groups.length > 0 || showEditor || !error) && (
        <section aria-label="Справочник ролей" className="grid gap-4 md:grid-cols-[minmax(215px,28%)_minmax(0,1fr)] md:items-start">
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="space-y-2.5 border-b border-border p-3">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <h2 className="text-sm font-semibold">Справочник</h2>
                <span className="text-xs tabular-nums text-muted-foreground" aria-label={`Ролей: ${visibleGroups.length}`}>{visibleGroups.length}</span>
              </div>
              <label className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" aria-label="Поиск по ролям" placeholder="Найти роль" value={search} onChange={(event) => setSearch(event.target.value)} className={cn(fieldClass, 'pl-9')} />
              </label>
            </div>
            {visibleGroups.length ? (
              <ul aria-label="Роли" className="roadmap-scrollbar max-h-52 overflow-auto p-1.5 md:max-h-[60vh]">
                {visibleGroups.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      aria-current={entry.key === group?.key ? 'true' : undefined}
                      disabled={pending}
                      onClick={() => {
                        if (entry.key === group?.key) {
                          setFocusEditor(true);
                          return;
                        }
                        const useCurrentProject = !entry.roles.length || entry.roles.some((item) => item.projectId === selectedProjectId);
                        select({ groupKey: entry.key, projectId: useCurrentProject ? selectedProjectId : '' });
                      }}
                      className={cn('flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', entry.key === group?.key && 'bg-primary/10 hover:bg-primary/15')}
                    >
                      <RoleMark name={entry.label.name} color={entry.label.color} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium">{entry.label.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{projectCount(entry.roles.length)}</span>
                      </span>
                      {entry.roles.some((item) => item.azureEstimateField) && (
                        <span role="img" aria-label="Роль из Azure DevOps" className="shrink-0 text-primary" title="Роль из Azure DevOps">
                          <RefreshCw aria-hidden="true" className="size-3.5" />
                        </span>
                      )}
                      {entry.key === group?.key && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center">
                <p role="status" className="text-sm text-muted-foreground">{search.trim() ? 'Роли не найдены.' : 'В справочнике пока нет ролей.'}</p>
                {search.trim() && <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setSearch('')}>Очистить поиск</Button>}
              </div>
            )}
          </div>

          {showEditor ? (
            <form
              aria-label={creating ? 'Новая роль' : `Роль «${roleName}»`}
              aria-busy={pending}
              noValidate
              onSubmit={(event) => { event.preventDefault(); if (canSave) save.mutate(); }}
              className="@container min-w-0 rounded-xl border border-border bg-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  {!creating && <RoleMark name={roleName} color={form.color} />}
                  <h2 ref={heading} tabIndex={-1} className="min-w-0 break-words rounded-sm text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{creating ? 'Новая роль' : roleName}</h2>
                </div>
                {role?.azureEstimateField && <AzureRoleMark />}
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                {mutationError && <AdminAlert tone="error">{mutationError instanceof Error ? mutationError.message : 'Не удалось сохранить изменения.'}</AdminAlert>}
                {pendingSelection && (
                  <div ref={unsavedPrompt} tabIndex={-1} role="group" aria-labelledby={`${fieldId}-unsaved`} className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <p id={`${fieldId}-unsaved`} className="text-sm font-medium">В карточке есть несохранённые изменения.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => {
                        setPendingSelection(undefined);
                        if (navigationTrigger.current?.isConnected) navigationTrigger.current.focus();
                        else heading.current?.focus();
                      }}>Остаться</Button>
                      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => applySelection(pendingSelection)}>Не сохранять</Button>
                      <Button type="button" size="sm" disabled={!canSave} onClick={() => save.mutate(undefined, { onSuccess: () => applySelection(pendingSelection) })}>Сохранить и перейти</Button>
                    </div>
                  </div>
                )}
                {creating && (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <label className={labelClass} htmlFor={`${fieldId}-name`}>Название роли</label>
                      <input ref={nameInput} id={`${fieldId}-name`} value={form.name} maxLength={100} required disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={fieldClass} aria-invalid={nameTaken || undefined} aria-describedby={nameTaken ? `${fieldId}-duplicate` : undefined} />
                      {nameTaken && <p id={`${fieldId}-duplicate`} className="mt-1.5 text-sm text-destructive">Роль с таким названием уже есть.</p>}
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`${fieldId}-color`}>Цвет</label>
                      <input id={`${fieldId}-color`} type="color" value={form.color} disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className={colorFieldClass} />
                    </div>
                  </div>
                )}

                <div className={cn('grid gap-3', selectedProjectId && '@min-[36rem]:grid-cols-2 @min-[36rem]:gap-x-4')}>
                  <div className="min-w-0">
                    <label htmlFor={`${fieldId}-project`} className={labelClass}>{creating ? 'Проект (необязательно)' : 'Проект'}</label>
                    <SearchableSelect
                      id={`${fieldId}-project`}
                      ariaLabel={creating ? 'Проект (необязательно)' : 'Проект'}
                      value={selectedProjectId || (creating ? noProjectValue : '')}
                      onChange={(value) => {
                        if (value === selectedProjectId) return;
                        if (creating) {
                          setSelection({ groupKey: newRoleKey, projectId: value });
                          if (value === noProjectValue) setDraft(({ name, color }) => ({ name, color }));
                        } else if (group) {
                          select({ groupKey: group.key, projectId: value });
                        }
                      }}
                      options={projectOptions}
                      disabled={pending || !allowedProjects.length}
                      placeholder={creating ? 'Без проекта' : 'Выберите проект'}
                      searchPlaceholder="Найти проект"
                      className="border-border bg-transparent shadow-none"
                    />
                    {projectsQuery.isLoading && !allowedProjects.length ? <p role="status" className="mt-1.5 text-sm text-muted-foreground">Загружаем проекты…</p> : null}
                    {!projectsQuery.isLoading && !allowedProjects.length ? (
                      <Button type="button" variant="link" size="sm" className="-ml-3" onClick={openImport}>Загрузить проекты из Azure DevOps</Button>
                    ) : null}
                  </div>

                  {selectedProjectId && (
                    <div className="min-w-0">
                      <label htmlFor={`${fieldId}-person`} className={labelClass}>Сотрудник по умолчанию</label>
                      <SearchableSelect
                        id={`${fieldId}-person`}
                        ariaLabel="Сотрудник по умолчанию"
                        value={form.personId}
                        onChange={(value) => setDraft((current) => ({ ...current, personId: value === noPersonValue ? '' : value }))}
                        options={options}
                        disabled={pending || peopleQuery.isLoading || (!activePeople.length && !form.personId)}
                        placeholder="Не назначен"
                        searchPlaceholder="Найти по ФИО или почте"
                        className="border-border bg-transparent shadow-none"
                      />
                    </div>
                  )}
                </div>

                {selectedProjectId && (peopleQuery.isError ? <AdminAlert tone="error">
                    <p>Не удалось загрузить сотрудников.</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" disabled={peopleQuery.isFetching} onClick={() => void peopleQuery.refetch()}>Повторить</Button>
                  </AdminAlert> : peopleQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Загружаем сотрудников…</p>
                    : !activePeople.length && !form.memberIds.length && !form.personId ? <Link className="inline-block rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={routes.roadmapAdminUsers}>Загрузить сотрудников</Link>
                    : <RoleMembersPicker
                      key={`${selection?.groupKey ?? group?.key}:${selectedProjectId}`}
                      people={people}
                      memberIds={form.memberIds}
                      defaultPersonId={form.personId}
                      role={role}
                      disabled={pending}
                      onChange={(next) => setDraft((current) => ({ ...current, memberIds: next }))}
                    />)}

                {role && (
                  <details key={role.id} className="group border-t border-border pt-2">
                    <summary className="-ml-2 flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                      Настройки роли
                      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 pt-3">
                      <div className="flex items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <label className={labelClass} htmlFor={`${fieldId}-name`}>Название роли</label>
                          <input id={`${fieldId}-name`} value={form.name} maxLength={100} required disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={fieldClass} />
                        </div>
                        <div>
                          <label className={labelClass} htmlFor={`${fieldId}-color`}>Цвет</label>
                          <input id={`${fieldId}-color`} type="color" value={form.color} disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className={colorFieldClass} />
                        </div>
                      </div>
                      {confirmRemoval ? (
                        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                          <span>Убрать роль и её участников из проекта?</span>
                          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmRemoval(false)}>Отмена</Button>
                          <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => remove.mutate(role.id)}>Убрать</Button>
                        </div>
                      ) : (
                        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmRemoval(true)}>
                          <Trash2 aria-hidden="true" className="size-3.5" /> Убрать роль из проекта
                        </Button>
                      )}
                    </div>
                  </details>
                )}
              </div>

              {showFormActions && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
                {creating ? <Button type="button" variant="ghost" disabled={pending} onClick={() => applySelection({ groupKey: groups[0]?.key ?? '', projectId: '' })}>Отмена</Button>
                  : dirty ? <Button type="button" variant="ghost" disabled={pending} onClick={() => { setDraft({}); heading.current?.focus(); }}>Сбросить</Button> : null}
                <Button type="submit" disabled={!canSave}>
                  {save.isPending ? 'Сохраняем…' : creating ? 'Создать роль' : role ? 'Сохранить' : 'Добавить в проект'}
                </Button>
              </div>}
            </form>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <Button type="button" variant="outline" size="sm" onClick={openImport}>Загрузить роли из Azure DevOps</Button>
            </div>
          )}
        </section>
      )}
    </AdminPage>
  );
}
