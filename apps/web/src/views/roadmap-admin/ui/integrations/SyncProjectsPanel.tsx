'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, FolderSync, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { roadmapApi, type RoadmapReadinessCheck, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { AzurePushPreview } from '@/entities/roadmap/ui/AzurePushPreview';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { CheckStatusIcon, Chip, errorText, MODE_LABEL, Panel } from './parts';

type OverviewProject = RoadmapWriteBackOverview['projects'][number];

export function SyncProjectsPanel({ overview, loading }: { overview?: RoadmapWriteBackOverview; loading: boolean }) {
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: roadmapApi.pushAllocationToAzure,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
  });

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Загружаем статус синхронизации…</p>;
  if (!overview) return null;
  const projectName = new Map(overview.projects.map((project) => [project.id, project.name]));

  return (
    <div className="space-y-5">
      <Panel
        title="Проекты"
        description={`Режим записи: ${MODE_LABEL[overview.settings.mode].toLowerCase()}. Проверьте готовность, посмотрите и отправьте изменения, подтяните факт из Azure.`}
        icon={<FolderSync className="h-[18px] w-[18px]" strokeWidth={1.7} />}
      >
        {overview.projects.length ? <ul className="divide-y divide-border">
          {overview.projects.map((project) => <ProjectRow key={project.id} project={project} writeBackOff={overview.settings.mode === 'off'} />)}
        </ul> : <p className="px-5 py-8 text-center text-sm text-muted-foreground">Импортируйте проект на странице плана, чтобы настроить синхронизацию.</p>}
      </Panel>

      <Panel title="Ошибки отправки" description={overview.errors.length ? 'Последние назначения, которые Azure DevOps не принял. Исправьте причину и отправьте снова.' : 'Ошибок нет.'}>
        {overview.errors.length ? <ul className="divide-y divide-border/70">
          {overview.errors.map((error) => <li key={error.allocationId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate font-medium text-foreground">#{error.workItemExternalId} {error.workItemTitle}</p>
              <p className="text-xs text-muted-foreground">{projectName.get(error.projectId)} · {error.roleName} · {error.personName} · {error.quarterKey}</p>
              <p className="break-words text-xs text-destructive">{error.error}</p>
            </div>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={retryMutation.isPending || overview.settings.mode === 'off'} onClick={() => retryMutation.mutate(error.allocationId)}>
              <RefreshCw className="h-3.5 w-3.5" />Отправить снова
            </Button>
          </li>)}
        </ul> : null}
        {retryMutation.error ? <p role="alert" className="border-t border-border px-5 py-2 text-xs text-destructive">{errorText(retryMutation.error)}</p> : null}
      </Panel>
    </div>
  );
}

function ProjectRow({ project, writeBackOff }: { project: OverviewProject; writeBackOff: boolean }) {
  const queryClient = useQueryClient();
  const [checks, setChecks] = useState<RoadmapReadinessCheck[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toSend = project.counts.notSent + project.counts.pending + project.counts.error;

  const checkMutation = useMutation({
    mutationFn: () => roadmapApi.checkWriteBack(project.id),
    onSuccess: (result) => setChecks(result.checks),
  });
  const pullMutation = useMutation({
    mutationFn: () => roadmapApi.syncProject({ id: project.externalId, name: project.name, url: project.url ?? undefined, imported: true, roadmapId: project.id }),
    onSuccess: async (result) => {
      setNotice(`Загружено из Azure: ${result.importedWorkItems} work items. Факт обновлён.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', project.id] }),
      ]);
    },
  });
  const error = checkMutation.error ?? pullMutation.error;

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {project.name}
            {project.enabled ? null : <Chip tone="warn">не включён в запись</Chip>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok" title="Задачи созданы и совпадают с планом">В Azure: {project.counts.synced}</Chip>
            {project.counts.pending ? <Chip tone="warn" title="Изменено в Roadmap, ждёт отправки">Ожидает: {project.counts.pending}</Chip> : null}
            {project.counts.notSent ? <Chip title="Ни разу не отправлялось">Не отправлено: {project.counts.notSent}</Chip> : null}
            {project.counts.error ? <Chip tone="error">Ошибок: {project.counts.error}</Chip> : null}
            {project.counts.skipped ? <Chip title="Демо-участники или проект вне записи">Пропущено: {project.counts.skipped}</Chip> : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Факт загружен: {project.syncedAt ? new Date(project.syncedAt).toLocaleString('ru-RU') : 'ещё нет'}
            {' · '}План отправлен: {project.lastPushedAt ? new Date(project.lastPushedAt).toLocaleString('ru-RU') : 'ещё нет'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={checkMutation.isPending} onClick={() => checkMutation.mutate()} title="Проверяет права, тип, поля, итерацию и участников. В Azure ничего не создаётся.">
            {checkMutation.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}Проверить готовность
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={pullMutation.isPending} onClick={() => { setNotice(null); pullMutation.mutate(); }} title="Перечитать work items и Completed Work из Azure DevOps">
            {pullMutation.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}Загрузить из Azure
          </Button>
          <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" className="h-8 gap-1.5" disabled={writeBackOff || !project.enabled || !toSend} title={writeBackOff ? 'Включите запись в настройках' : 'Посмотреть, что уйдёт в Azure, и отправить'}>
                <ArrowUpFromLine className="h-3.5 w-3.5" />Отправить в Azure{toSend ? ` (${toSend})` : ''}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0">
              {previewOpen ? <AzurePushPreview projectId={project.id} onDone={(queued) => { setPreviewOpen(false); setNotice(`Отправка запущена: ${queued}. Статусы обновятся автоматически.`); }} /> : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {notice ? <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{errorText(error)}</p> : null}
      {checks ? <ul className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
        {checks.map((check) => <li key={check.key} className="flex items-start gap-2 text-sm">
          <CheckStatusIcon status={check.status} />
          <span className="min-w-0"><span className="font-medium text-foreground">{check.label}.</span> <span className="break-words text-muted-foreground">{check.detail}</span></span>
        </li>)}
      </ul> : null}
    </li>
  );
}
