'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ChevronDown, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { roadmapApi, type RoadmapReadinessCheck, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { AzurePushPreview } from '@/entities/roadmap/ui/AzurePushPreview';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { CheckStatusIcon, Chip, errorText, FLAT_OUTLINE, FLAT_PRIMARY, integrationColors, MODE_LABEL, Panel } from './parts';

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
      <Panel
        title="Синхронизация проектов"
        titleProps={{ tabIndex: -1 }}
        description="Задачи, роли, оценки и фактические часы по добавленным проектам. Новый проект загружается на странице плана."
        actions={<Link href={routes.roadmap} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), FLAT_OUTLINE)}>
          Открыть план <ArrowRight aria-hidden="true" className="size-4" />
        </Link>}
      >
        {overview.projects.length ? <ul className="divide-y divide-border">
          {overview.projects.map((project) => <ProjectRow key={project.id} project={project} writeBackOff={overview.settings.mode === 'off'} />)}
        </ul> : <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">Проектов пока нет. Загрузите первый на странице плана.</p>}
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          Отправка плана: {MODE_LABEL[overview.settings.mode]} · <a href="#azure-write-back" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">изменить</a>
        </p>
      </Panel>
      </div>

      {overview.errors.length || retryMutation.error ? <Panel title="Ошибки отправки" description="Проверьте причину и повторите отправку назначения.">
        {overview.errors.length ? <ul className="divide-y divide-border/70">
          {overview.errors.map((error) => <li key={error.allocationId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate font-medium text-foreground">#{error.workItemExternalId} {error.workItemTitle}</p>
              <p className="text-xs text-muted-foreground">{projectName.get(error.projectId)} · {error.roleName} · {error.personName} · {error.quarterKey}</p>
              <p className="break-words text-xs text-destructive">{error.error}</p>
            </div>
            <Button type="button" size="sm" variant="outline" className={cn(FLAT_OUTLINE, "gap-1.5")} disabled={retryMutation.isPending || overview.settings.mode === 'off'} onClick={() => retryMutation.mutate(error.allocationId)}>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
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
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'local-projects'] }),
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
    <li id={`azure-sync-project-${project.id}`} className="scroll-mt-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 tabIndex={-1} className="w-fit wrap-break-word rounded text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{project.name}</h3>
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${project.syncedAt ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
              {project.syncedAt ? `Обновлено ${formatDateTime(project.syncedAt)}` : 'Задачи ещё не загружены'}
            </p>
          </div>
          {project.total > 0 ? <div className="flex flex-wrap gap-1.5">
            {project.counts.synced > 0 ? <Chip tone="ok" label="В Azure" count={project.counts.synced} title="Задачи созданы и совпадают с планом" /> : null}
            {project.counts.pending ? <Chip tone="warn" label="Ожидает" count={project.counts.pending} title="Изменено в Roadmap, ждёт отправки" /> : null}
            {project.counts.sending ? <Chip tone="info" label="Отправляется" count={project.counts.sending} title="Задача обрабатывается очередью" /> : null}
            {project.counts.notSent ? <Chip label="Не отправлено" count={project.counts.notSent} title="Ни разу не отправлялось" /> : null}
            {project.counts.error ? <Chip tone="error" label="Ошибок" count={project.counts.error} /> : null}
            {project.counts.conflict ? <Chip tone="warn" label="Конфликтов" count={project.counts.conflict} title="Поле изменили вручную в Azure" /> : null}
            {project.counts.skipped ? <Chip label="Пропущено" count={project.counts.skipped} title="Демо-участники или проект вне записи" /> : null}
          </div> : null}
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
            className="inline-flex min-h-6 items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform motion-reduce:transition-none ${detailsOpen ? 'rotate-180' : ''}`} />
            Подробности синхронизации
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          <Button type="button" variant="outline" size="sm" className={FLAT_OUTLINE} disabled={actionsBusy} onClick={() => { setNotice(null); checkMutation.reset(); pullMutation.mutate(); }}>
            {pullMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ArrowDownToLine aria-hidden="true" className="size-4" />}
            {pullMutation.isPending ? 'Загружаем…' : project.syncedAt ? 'Обновить из Azure' : 'Загрузить из Azure'}
          </Button>
          {writeBackAvailable && toSend > 0 ? <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" className={FLAT_PRIMARY} disabled={actionsBusy}>
                <ArrowUpFromLine aria-hidden="true" className="size-4" />Отправить в Azure ({toSend})
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className={`w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 ${integrationColors}`}>
              {previewOpen ? <AzurePushPreview projectId={project.id} onDone={(queued) => { setPreviewOpen(false); setNotice(`Отправка запущена: ${queued}. Статусы обновятся автоматически.`); }} /> : null}
            </PopoverContent>
          </Popover> : null}
        </div>
      </div>
      {notice ? <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {pullMutation.data?.roleSyncWarning ? <p role="status" className="mt-2 text-sm text-amber-800 dark:text-amber-200">{pullMutation.data.roleSyncWarning}</p> : null}
      {pullMutation.error ? <p role="alert" className="mt-2 text-sm text-destructive">{errorText(pullMutation.error)}</p> : null}
      {detailsOpen ? <div id={detailsId} className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3.5">
        <dl className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="space-y-0.5"><dt className="text-muted-foreground">Запись плана</dt><dd className="font-medium text-foreground">{writeBackOff ? 'Выключена' : project.enabled ? 'Разрешена' : 'Выключена для проекта'}</dd></div>
          <div className="space-y-0.5"><dt className="text-muted-foreground">Последняя отправка плана</dt><dd className="font-medium text-foreground">{project.lastPushedAt ? formatDateTime(project.lastPushedAt) : 'Ещё не было'}</dd></div>
          <div className="space-y-0.5"><dt className="text-muted-foreground">Последнее событие webhook</dt><dd className="font-medium text-foreground">{project.lastWebhookAt ? formatDateTime(project.lastWebhookAt) : 'Событий пока нет'}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" className={FLAT_OUTLINE} disabled={actionsBusy} onClick={() => checkMutation.mutate()}>
            {checkMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
            {checkMutation.isPending ? 'Проверяем…' : 'Проверить готовность'}
          </Button>
          {project.lastCheckAt ? <p className="text-xs text-muted-foreground">Последняя проверка {formatDateTime(project.lastCheckAt)}</p> : null}
        </div>
        {checkMutation.error ? <p role="alert" className="text-sm text-destructive">{errorText(checkMutation.error)}</p> : null}
        {(checks ?? project.lastCheck) ? <ul className="space-y-2" aria-label="Результаты проверки" aria-live="polite">
          {(checks ?? project.lastCheck)?.map((check) => <li key={check.key} className="flex items-start gap-2 text-sm">
            <CheckStatusIcon status={check.status} />
            <span className="min-w-0"><span className="font-medium text-foreground">{check.label}.</span> <span className="wrap-break-word text-muted-foreground">{check.detail}</span></span>
          </li>)}
        </ul> : null}
      </div> : null}
    </li>
  );
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
