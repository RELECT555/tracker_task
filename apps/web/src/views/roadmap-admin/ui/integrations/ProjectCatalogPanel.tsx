'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowDownToLine, ArrowRight, FolderPlus, LoaderCircle } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { routes } from '@/shared/config/routes';
import { Button, buttonVariants } from '@/shared/ui/button';
import { AdminAlert, AdminCard } from '../AdminLayout';
import { errorText } from './parts';

export function ProjectCatalogPanel({ inRoles = false, onRolesImported }: { inRoles?: boolean; onRolesImported?: () => void }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const settingsQuery = useQuery({
    queryKey: ['roadmap', 'integration', 'azure-devops'],
    queryFn: roadmapApi.integrationSettings,
    enabled: inRoles,
  });
  const configured = !inRoles || settingsQuery.data?.configured === true;
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects, enabled: configured });
  const projects = projectsQuery.data?.data ?? [];
  const project = projects.find((item) => item.id === projectId);
  const usingCache = projectsQuery.data?.source === 'cache';
  const accessDenied = projectsQuery.data?.azureError === 'access-denied';
  const connectionHref = `${routes.roadmapAdmin}#azure-connection`;
  const connectionLink = inRoles
    ? <Link href={connectionHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Настройки подключения</Link>
    : <a href="#azure-connection" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Настройки подключения</a>;
  const sync = useMutation({
    mutationFn: roadmapApi.syncProjectCatalog,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'admin', 'role-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'roles', result.projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', result.projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
      ]);
      if (result.importedRoles > 0) onRolesImported?.();
    },
  });

  return (
    <div id={inRoles ? 'azure-role-import' : undefined}>
    <AdminCard
      title={inRoles ? 'Роли из Azure DevOps' : 'Проекты и роли'}
      titleProps={inRoles ? undefined : { tabIndex: -1 }}
      description={inRoles ? 'Выберите проект, чтобы добавить в справочник его роли из вкладки Roles Estimate.' : 'Добавьте проект в Roadmap и загрузите его роли из Azure DevOps.'}
      icon={<FolderPlus aria-hidden="true" className="size-[18px]" strokeWidth={1.7} />}
    >
      <div className="space-y-4 p-4 sm:p-5">
        {inRoles && settingsQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Проверяем подключение к Azure DevOps…</p> : null}
        {inRoles && !configured && !settingsQuery.isLoading ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">{settingsQuery.isError ? 'Не удалось проверить подключение к Azure DevOps.' : 'Подключите Azure DevOps, чтобы загружать роли.'}</p>
            {connectionLink}
          </div>
        ) : null}
        {configured && projectsQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Загружаем список проектов…</p> : null}
        {configured && (projectsQuery.isError || usingCache) ? (
          <div className="space-y-3">
            <AdminAlert tone="error">{accessDenied
              ? 'Azure DevOps отклонил доступ. Проверьте срок действия токена и права на чтение проектов и задач.'
              : usingCache ? 'Azure DevOps недоступен. Ранее загруженные роли остаются в справочнике.' : 'Не удалось получить проекты из Azure DevOps.'}</AdminAlert>
            <div className="flex flex-wrap gap-2">
              {accessDenied ? connectionLink : null}
              <Button type="button" size="sm" variant="outline" disabled={projectsQuery.isFetching} onClick={() => void projectsQuery.refetch()}>
                {projectsQuery.isFetching ? 'Проверяем…' : 'Повторить'}
              </Button>
            </div>
          </div>
        ) : null}
        {configured && projectsQuery.isSuccess && !usingCache && !projects.length ? <p role="status" className="text-sm text-muted-foreground">У подключения нет доступных проектов Azure DevOps.</p> : null}
        {configured && projects.length > 0 && !usingCache ? (
          <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-medium">Проект Azure DevOps</p>
              <AzureProjectPicker
                projects={projects}
                value={projectId}
                onChange={(value) => { setProjectId(value); sync.reset(); }}
                placeholder="Выберите проект"
                disabled={sync.isPending}
                className="w-full"
              />
            </div>
            <Button type="button" className="min-h-10" disabled={!project || sync.isPending} onClick={() => project && sync.mutate(project)}>
              {sync.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ArrowDownToLine aria-hidden="true" className="size-4" />}
              {sync.isPending ? 'Загружаем…' : inRoles
                ? project?.imported ? 'Обновить роли из Azure' : 'Загрузить роли из Azure'
                : project?.imported ? 'Обновить проект и роли' : 'Загрузить проект и роли'}
            </Button>
          </div>
        ) : null}
        {sync.isError ? <AdminAlert tone="error">{errorText(sync.error)}</AdminAlert> : null}
        {sync.data ? (
          <>
            <AdminAlert tone="success">
              <p>Проект «{sync.variables?.name}» {sync.variables?.imported ? 'обновлён' : 'добавлен в Roadmap'}.{sync.data.importedRoles > 0 ? ` Загружено ролей: ${sync.data.importedRoles}.` : null}</p>
              {!inRoles && !sync.variables?.planSynced ? <p className="mt-1">Чтобы открыть план проекта, загрузите его задачи.</p> : null}
            </AdminAlert>
            {sync.data.roleSyncWarning ? <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">{sync.data.roleSyncWarning}</p> : null}
            {!inRoles && !sync.variables?.planSynced ? (
              <a href={`#azure-sync-project-${sync.data.projectId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                К загрузке задач <ArrowDown aria-hidden="true" className="size-4" />
              </a>
            ) : null}
          </>
        ) : null}
        {!inRoles ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">Связать роли с сотрудниками можно в справочнике.</p>
          <Link href={routes.roadmapAdminRoles} className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3 sm:ml-0' })}>
            Справочник ролей <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div> : null}
      </div>
    </AdminCard>
    </div>
  );
}
