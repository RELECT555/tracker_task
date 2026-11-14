'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { roadmapApi, type RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { ApiError } from '@/shared/api/client';
import { routes } from '@/shared/config/routes';
import { getErrorMessage } from '@/shared/lib/error-message';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { normalizeRoleName } from '../model/role-name';
import { AdminPage } from './AdminLayout';
import { RemoveRoleDialog } from './roles/RemoveRoleDialog';
import { RoleAssignmentBoard } from './roles/RoleAssignmentBoard';
import { RoleEditorDialog } from './roles/RoleEditorDialog';

const adminRolesQueryKey = ['roadmap', 'admin', 'roles'] as const;

type RoleEditor = { projectId: string; projectName: string; role?: RoadmapRole };

export function RoadmapRolesPage({ initialProjectId }: { initialProjectId?: string }) {
  const client = useQueryClient();
  const fieldId = useId();
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const catalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog });
  const rolesQuery = useQuery({ queryKey: adminRolesQueryKey, queryFn: () => roadmapApi.adminRoles() });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [editor, setEditor] = useState<RoleEditor>();
  const [removalTarget, setRemovalTarget] = useState<RoadmapRole>();
  const [status, setStatus] = useState('');

  const projects = new Map<string, string>();
  for (const project of projectsQuery.data?.data ?? []) {
    if (project.roadmapId) projects.set(project.roadmapId, project.name);
  }
  const projectOptions = [...projects]
    .sort(([, left], [, right]) => left.localeCompare(right, 'ru-RU'))
    .map(([value, label]) => ({ value, label, leading: <Building2 aria-hidden="true" className="size-4" /> }));
  const selectedProjectId = projects.has(projectId) ? projectId : projectOptions[0]?.value ?? '';
  const projectName = projects.get(selectedProjectId) ?? '';
  const projectRoles = (rolesQuery.data ?? [])
    .filter((entry) => entry.projectId === selectedProjectId)
    .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'));
  const projectRoleNames = new Set(projectRoles.map((entry) => normalizeRoleName(entry.name)));
  const catalog = catalogQuery.data ?? [];
  const availableTemplates = catalog
    .filter((entry) => !projectRoleNames.has(normalizeRoleName(entry.name)))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'));

  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'role-catalog'] }),
    client.invalidateQueries({ queryKey: adminRolesQueryKey }),
    client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'users'] }),
    client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
    client.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
  ]);

  const remove = useMutation({
    mutationFn: (target: RoadmapRole) => roadmapApi.deleteRole(target.id),
    onSuccess: async (_, target) => {
      await client.cancelQueries({ queryKey: adminRolesQueryKey });
      if (add.data?.id === target.id) add.reset();
      client.setQueryData<RoadmapRole[]>(adminRolesQueryKey, (current) => current?.filter((entry) => entry.id !== target.id));
      await refresh();
      setRemovalTarget(undefined);
    },
  });

  const add = useMutation({
    mutationFn: ({ projectId, templateId }: { projectId: string; templateId: string; withKeyboard: boolean }) =>
      roadmapApi.addRoleFromCatalog(projectId, templateId),
    onSuccess: async (addedRole, { projectId }) => {
      await client.cancelQueries({ queryKey: adminRolesQueryKey });
      client.setQueryData<RoadmapRole[]>(adminRolesQueryKey, (current = []) => [
        ...current.filter((entry) => entry.id !== addedRole.id),
        { ...addedRole, projectId, projectName: projects.get(projectId) },
      ]);
      setSearch('');
      await refresh();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        await client.invalidateQueries({ queryKey: adminRolesQueryKey });
      }
    },
  });

  const pending = remove.isPending || add.isPending;
  const loading = rolesQuery.isLoading || projectsQuery.isLoading;
  const addError = add.error instanceof ApiError && add.error.status === 409
    ? 'В проекте уже есть такая роль.'
    : add.error ? getErrorMessage(add.error) : undefined;
  const canAdd = Boolean(selectedProjectId) && !pending && !rolesQuery.isError && !catalogQuery.isError;

  function openEditor(role?: RoadmapRole) {
    if (!selectedProjectId || pending) return;
    setStatus('');
    setEditor({ projectId: selectedProjectId, projectName, role });
  }

  return (
    <AdminPage className="lg:flex lg:h-full lg:flex-col lg:gap-6 lg:space-y-0">
      <QueryErrorNotice
        title={addError ? 'Не удалось добавить роль' : 'Не удалось загрузить роли и проекты'}
        queries={[rolesQuery, projectsQuery, catalogQuery]}
        errors={[addError]}
      />
      {loading ? <p role="status" className="text-sm text-muted-foreground">Загружаем проекты и роли…</p> : projectOptions.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-end gap-3">
          <div className="w-full min-w-0 sm:max-w-sm">
            <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-foreground">Проект</label>
            <SearchableSelect
              id={fieldId}
              ariaLabel="Проект"
              value={selectedProjectId}
              onChange={(nextProjectId) => {
                if (nextProjectId === selectedProjectId) return;
                setProjectId(nextProjectId);
                setSearch('');
                setStatus('');
                add.reset();
                remove.reset();
              }}
              options={projectOptions}
              disabled={pending}
              placeholder="Выберите проект"
              searchPlaceholder="Найти проект"
            />
          </div>
          <Button type="button" variant="outline" aria-haspopup="dialog" className="min-h-10" disabled={pending || rolesQuery.isError || !catalogQuery.data} onClick={() => openEditor()}>
            <Plus aria-hidden="true" className="size-4" /> Новая роль
          </Button>
        </div>
      ) : !projectsQuery.isError && !rolesQuery.isError && (
        <section className="rounded-xl border border-border bg-card px-5 py-6">
          <h2 className="text-base font-semibold">Пока нет загруженных проектов</h2>
          <p className="mt-1 text-sm text-muted-foreground">Загрузите проект из Azure DevOps на странице плана. Его роли появятся здесь.</p>
          <Link href={routes.roadmap} className="mt-3 inline-block rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Перейти к плану проекта</Link>
        </section>
      )}
      {!loading && selectedProjectId && (!rolesQuery.isError || rolesQuery.data) && (
        <RoleAssignmentBoard
          key={selectedProjectId}
          projectName={projectName}
          roles={projectRoles}
          availableRoles={availableTemplates}
          catalogNotice={catalogQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Загружаем каталог…</p>
            : catalogQuery.isError && !catalogQuery.data ? <p className="text-sm text-muted-foreground">Каталог временно недоступен.</p> : undefined}
          addingRoleId={add.isPending ? add.variables.templateId : undefined}
          addedRole={add.data}
          focusAddedRole={add.isSuccess && add.variables.withKeyboard}
          removedRoleName={remove.isSuccess ? remove.variables.name : undefined}
          status={status}
          projectSearch={search}
          disabled={pending}
          canAdd={canAdd}
          onProjectSearchChange={setSearch}
          onEditRole={openEditor}
          onRemoveRole={(target) => {
            remove.reset();
            setStatus('');
            setRemovalTarget(target);
          }}
          onAddRole={(templateId, withKeyboard = false) => {
            if (!canAdd || !availableTemplates.some((entry) => entry.id === templateId)) return;
            remove.reset();
            setStatus('');
            add.mutate({ projectId: selectedProjectId, templateId, withKeyboard });
          }}
        />
      )}
      {editor && (
        <RoleEditorDialog
          projectId={editor.projectId}
          projectName={editor.projectName}
          role={editor.role}
          roleNames={new Set([...projectRoleNames, ...catalog.map((entry) => normalizeRoleName(entry.name))])}
          peopleQuery={peopleQuery}
          onClose={() => setEditor(undefined)}
          onSaved={async (message, name) => {
            await refresh();
            if (!editor.role || !normalizeRoleName(name).includes(normalizeRoleName(search))) setSearch('');
            setStatus(message);
          }}
        />
      )}
      {removalTarget && (
        <RemoveRoleDialog
          roleName={removalTarget.name}
          projectName={projects.get(removalTarget.projectId ?? '') ?? ''}
          pending={remove.isPending}
          error={remove.error}
          onClose={() => { setRemovalTarget(undefined); remove.reset(); }}
          onRemove={() => remove.mutate(removalTarget)}
        />
      )}
    </AdminPage>
  );
}
