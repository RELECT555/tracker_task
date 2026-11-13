'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ChevronDown, FolderSync, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { roadmapApi, type RoadmapReadinessCheck, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { AzurePushPreview } from '@/entities/roadmap/ui/AzurePushPreview';
import { routes } from '@/shared/config/routes';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { AdminCard } from '../AdminLayout';
import { CheckStatusIcon, Chip, errorText, integrationColors, MODE_LABEL, Panel } from './parts';

type OverviewProject = RoadmapWriteBackOverview['projects'][number];

export function SyncProjectsPanel({ overview }: { overview: RoadmapWriteBackOverview }) {
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: roadmapApi.pushAllocationToAzure,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
  });

  const projectName = new Map(overview.projects.map((project) => [project.id, project.name]));

  return (
    <div className="space-y-5">
      <div id="azure-task-sync" className="scroll-mt-4">
      <AdminCard title="Синхронизация проектов" titleProps={{ tabIndex: -1 }} description="Обновляйте задачи, роли, оценки и фактические часы по добавленным проектам."
        icon={<FolderSync aria-hidden="true" className="size-[18px]" strokeWidth={1.7} />}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <p>{overview.projects.length ? 'Новый проект можно загрузить на странице плана.' : 'Загрузите первый проект на странице плана.'}</p>
          <Link href={routes.roadmap} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Открыть план проекта <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {overview.projects.length ? <ul className="divide-y divide-border border-t border-border">
          {overview.projects.map((project) => <ProjectRow key={project.id} project={project} writeBackOff={overview.settings.mode === 'off'} />)}
        </ul> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-sm text-muted-foreground sm:px-5">
          <span>Режим отправки плана · {MODE_LABEL[overview.settings.mode]}</span>
          <a href="#azure-write-back" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Настроить запись</a>
        </div>
      </AdminCard>
      </div>

      {overview.errors.length || retryMutation.error ? <Panel title="Ошибки отправки" description="Проверьте причину и повторите отправку назначения.">
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
      </Panel> : null}
    </div>
  );
}

function ProjectRow({ project, writeBackOff }: { project: OverviewProject; writeBackOff: boolean }) {
  const queryClient = useQueryClient();
  const [checks, setChecks] = useState<RoadmapReadinessCheck[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toSend = project.counts.notSent + project.counts.pending + project.counts.error + project.counts.conflict;

  const checkMutation = useMutation({
    mutationFn: () => roadmapApi.checkWriteBack(project.id),
    onSuccess: async (result) => {
      setChecks(result.checks);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] });
    },
  });
  const pullMutation = useMutation({
    mutationFn: () => roadmapApi.syncProject({ id: project.externalId, name: project.name, url: project.url ?? undefined, imported: true, roadmapId: project.id }),
    onSuccess: async (result) => {
      setNotice(`Обновлено задач из Azure DevOps: ${result.importedWorkItems}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'roles', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'monthly-fact', project.id] }),
      ]);
    },
  });
  const writeBackAvailable = !writeBackOff && project.enabled;
  const actionsBusy = checkMutation.isPending || pullMutation.isPending;

  return (
    <li id={`azure-sync-project-${project.id}`} className="scroll-mt-4 space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full space-y-1">
          <h3 tabIndex={-1} className="w-fit wrap-break-word rounded text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{project.name}</h3>
          <p className="text-xs text-muted-foreground">
            {project.syncedAt ? `Обновлено ${new Date(project.syncedAt).toLocaleString('ru-RU')}` : 'Задачи ещё не загружены'}
          </p>
          {project.total > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">
            {project.counts.synced > 0 ? <Chip tone="ok" title="Задачи созданы и совпадают с планом">В Azure: {project.counts.synced}</Chip> : null}
            {project.counts.pending ? <Chip tone="warn" title="Изменено в Roadmap, ждёт отправки">Ожидает: {project.counts.pending}</Chip> : null}
            {project.counts.sending ? <Chip tone="info" title="Задача обрабатывается очередью">Отправляется: {project.counts.sending}</Chip> : null}
            {project.counts.notSent ? <Chip title="Ни разу не отправлялось">Не отправлено: {project.counts.notSent}</Chip> : null}
            {project.counts.error ? <Chip tone="error">Ошибок: {project.counts.error}</Chip> : null}
            {project.counts.conflict ? <Chip tone="warn" title="Поле изменили вручную в Azure">Конфликтов: {project.counts.conflict}</Chip> : null}
            {project.counts.skipped ? <Chip title="Демо-участники или проект вне записи">Пропущено: {project.counts.skipped}</Chip> : null}
          </div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={actionsBusy} onClick={() => { setNotice(null); checkMutation.reset(); pullMutation.mutate(); }}>
            {pullMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ArrowDownToLine aria-hidden="true" className="size-4" />}
            {pullMutation.isPending ? 'Загружаем проект…' : project.syncedAt ? 'Обновить проект из Azure' : 'Загрузить проект из Azure'}
          </Button>
          {writeBackAvailable && toSend > 0 ? <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" disabled={actionsBusy}>
                <ArrowUpFromLine aria-hidden="true" className="size-4" />Отправить в Azure ({toSend})
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className={`w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 ${integrationColors}`}>
              {previewOpen ? <AzurePushPreview projectId={project.id} onDone={(queued) => { setPreviewOpen(false); setNotice(`Отправка запущена: ${queued}. Статусы обновятся автоматически.`); }} /> : null}
            </PopoverContent>
          </Popover> : null}
        </div>
      </div>
      {notice ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {pullMutation.data?.roleSyncWarning ? <p role="status" className="text-sm text-amber-800 dark:text-amber-200">{pullMutation.data.roleSyncWarning}</p> : null}
      {pullMutation.error ? <p role="alert" className="text-sm text-destructive">{errorText(pullMutation.error)}</p> : null}
      <details className="group">
        <summary className="inline-flex min-h-7 cursor-pointer list-none items-center gap-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="size-3.5 group-open:rotate-180" /> Подробности синхронизации
        </summary>
        <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div><dt className="text-muted-foreground">Запись плана</dt><dd>{writeBackOff ? 'Выключена' : project.enabled ? 'Разрешена' : 'Выключена для проекта'}</dd></div>
            <div><dt className="text-muted-foreground">Последняя отправка плана</dt><dd>{project.lastPushedAt ? new Date(project.lastPushedAt).toLocaleString('ru-RU') : 'Ещё не было'}</dd></div>
            <div><dt className="text-muted-foreground">Последнее событие webhook</dt><dd>{project.lastWebhookAt ? new Date(project.lastWebhookAt).toLocaleString('ru-RU') : 'Событий пока нет'}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={actionsBusy} onClick={() => checkMutation.mutate()}>
              {checkMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
              {checkMutation.isPending ? 'Проверяем…' : 'Проверить готовность'}
            </Button>
            {project.lastCheckAt ? <p className="text-xs text-muted-foreground">Последняя проверка {new Date(project.lastCheckAt).toLocaleString('ru-RU')}</p> : null}
          </div>
          {checkMutation.error ? <p role="alert" className="text-sm text-destructive">{errorText(checkMutation.error)}</p> : null}
          {(checks ?? project.lastCheck) ? <ul className="space-y-2" aria-label="Результаты проверки" aria-live="polite">
            {(checks ?? project.lastCheck)?.map((check) => <li key={check.key} className="flex items-start gap-2 text-sm">
              <CheckStatusIcon status={check.status} />
              <span className="min-w-0"><span className="font-medium text-foreground">{check.label}.</span> <span className="wrap-break-word text-muted-foreground">{check.detail}</span></span>
            </li>)}
          </ul> : null}
        </div>
      </details>
    </li>
  );
}
