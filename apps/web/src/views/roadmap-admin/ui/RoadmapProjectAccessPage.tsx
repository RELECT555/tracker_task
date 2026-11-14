'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { projectAccessApi, type ProjectAccess, type ProjectAccessRole } from '@/entities/roadmap/api/projectAccessApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { AdminCard, AdminPage, AdminPageHeader } from './AdminLayout';

const roleLabels: Record<ProjectAccessRole, string> = { viewer: 'Просмотр', planner: 'Редактирование плана' };

function ProjectMembers({ projectId, projectName, projectsQuery }: {
  projectId: string;
  projectName: string;
  projectsQuery: { error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectAccessRole>('viewer');
  const roleField = useRef<HTMLSelectElement>(null);
  const queryClient = useQueryClient();
  const queryKey = ['roadmap', 'project-access', projectId];
  const grants = useQuery({ queryKey, queryFn: () => projectAccessApi.list(projectId) });
  const save = useMutation({
    mutationFn: (entry: ProjectAccess) => projectAccessApi.set(projectId, entry),
    onSuccess: () => {
      setEmail('');
      setRole('viewer');
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const revoke = useMutation({
    mutationFn: (grantedEmail: string) => projectAccessApi.revoke(projectId, grantedEmail),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const busy = save.isPending || revoke.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    revoke.reset();
    save.mutate({ email: email.trim(), role });
  }

  return (
    <AdminCard title={projectName}>
      <div className="space-y-4 p-4 sm:p-5">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-[2_1_14rem] space-y-2">
            <Label htmlFor="project-access-email">Email сотрудника</Label>
            <Input id="project-access-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} required disabled={busy} />
          </div>
          <div className="min-w-0 flex-[1_1_12rem] space-y-2">
            <Label htmlFor="project-access-role">Права</Label>
            <select ref={roleField} id="project-access-role" value={role} onChange={(event) => setRole(event.target.value === 'planner' ? 'planner' : 'viewer')} disabled={busy} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <option value="viewer">{roleLabels.viewer}</option>
              <option value="planner">{roleLabels.planner}</option>
            </select>
          </div>
          <Button type="submit" disabled={busy}>{save.isPending ? 'Сохраняем…' : 'Сохранить доступ'}</Button>
        </form>
        <QueryErrorNotice
          title={save.error || revoke.error ? 'Не удалось изменить доступ к проекту' : 'Не удалось загрузить данные доступа'}
          queries={[projectsQuery, grants]}
          errors={[save.error, revoke.error]}
        />
        {grants.isPending ? <p role="status" className="text-sm text-muted-foreground">Загружаем список доступа…</p> : null}
        {grants.isSuccess && !grants.data.length ? <p className="text-sm text-muted-foreground">Доступ есть только у администратора.</p> : null}
        {grants.data?.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {grants.data.map((entry) => (
              <li key={entry.email} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{entry.email}</p>
                  <p className="text-xs text-muted-foreground">{roleLabels[entry.role]}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Изменить права для ${entry.email}`} onClick={() => {
                    setEmail(entry.email);
                    setRole(entry.role);
                    roleField.current?.focus();
                  }}>Изменить</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Отозвать доступ для ${entry.email}`} onClick={() => {
                    save.reset();
                    revoke.mutate(entry.email);
                  }}>Отозвать</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AdminCard>
  );
}

export function RoadmapProjectAccessPage() {
  const [projectKey, setProjectKey] = useState('');
  const demo = isRoadmapDemoMode();
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'project-access', 'projects'], queryFn: projectAccessApi.projects, enabled: !demo });
  const projects = (projectsQuery.data?.data ?? []).filter((project) => project.roadmapId);
  const project = projects.find((item) => item.id === projectKey) ?? projects[0];

  return (
    <AdminPage>
      <AdminPageHeader title="Доступ к проектам" description="Назначайте права просмотра и редактирования по корпоративному email. Сотрудники смогут войти после подключения корпоративного входа." />
      {demo ? <p className="text-sm text-muted-foreground">Управление доступом доступно для подключённых проектов Roadmap.</p> : <>
        {!project?.roadmapId ? <QueryErrorNotice title="Не удалось загрузить проекты" queries={[projectsQuery]} /> : null}
        {projectsQuery.isSuccess && !projects.length ? <p className="text-sm text-muted-foreground">Импортируйте проект из Azure DevOps, чтобы настроить доступ.</p> : null}
        <AzureProjectPicker projects={projects} value={project?.id ?? ''} onChange={setProjectKey} disabled={projectsQuery.isPending || !projects.length} placeholder="Выберите проект" />
        {project?.roadmapId ? <ProjectMembers key={project.roadmapId} projectId={project.roadmapId} projectName={project.name} projectsQuery={projectsQuery} /> : null}
      </>}
    </AdminPage>
  );
}
