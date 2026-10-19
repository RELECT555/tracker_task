'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpFromLine, LoaderCircle } from 'lucide-react';
import { roadmapApi, type RoadmapAzurePushPreview } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';

const ACTION_LABEL: Record<RoadmapAzurePushPreview['items'][number]['action'], { label: string; className: string }> = {
  create: { label: 'Создать', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  update: { label: 'Обновить', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  skip: { label: 'Пропустить', className: 'bg-muted text-muted-foreground' },
};

/**
 * Shows exactly what "Send to Azure" will create or update before anything is written,
 * and lets the user pick which assignments to send.
 */
export function AzurePushPreview({ projectId, onDone }: { projectId: string; onDone?: (queued: number) => void }) {
  const queryClient = useQueryClient();
  const previewQuery = useQuery({
    queryKey: ['roadmap', 'azure-push-preview', projectId],
    queryFn: () => roadmapApi.previewAzurePush(projectId),
  });
  const preview = previewQuery.data;
  const sendable = useMemo(() => preview?.items.filter((item) => item.action !== 'skip') ?? [], [preview]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set(sendable.map((item) => item.allocationId))), [sendable]);

  const pushMutation = useMutation({
    mutationFn: () => roadmapApi.pushProjectToAzure(projectId, [...selected]),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-push-preview', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
      ]);
      onDone?.(result.queued);
    },
  });

  if (previewQuery.isLoading) return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Собираем изменения…</p>;
  const error = previewQuery.error ?? pushMutation.error;
  if (!preview) return error ? <p role="alert" className="p-4 text-sm text-destructive">{error instanceof Error ? error.message : 'Не удалось загрузить изменения'}</p> : null;

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = sendable.length > 0 && sendable.every((item) => selected.has(item.allocationId));

  return (
    <div className="flex max-h-[min(70vh,640px)] flex-col">
      <div className="space-y-2 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Что уйдёт в Azure DevOps</p>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
          <span className={`rounded-full px-2 py-0.5 ${ACTION_LABEL.create.className}`}>Создать {preview.workItemType}: {preview.counts.create}</span>
          <span className={`rounded-full px-2 py-0.5 ${ACTION_LABEL.update.className}`}>Обновить: {preview.counts.update}</span>
          {preview.counts.skip ? <span className={`rounded-full px-2 py-0.5 ${ACTION_LABEL.skip.className}`}>Пропустить: {preview.counts.skip}</span> : null}
        </div>
        {preview.mode === 'off' ? <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Запись выключена в настройках интеграции — отправить нельзя.</p> : null}
        {!preview.projectAllowed ? <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Проект не включён в запись плана в настройках интеграции.</p> : null}
      </div>

      {preview.items.length ? <div className="min-h-0 flex-1 overflow-auto">
        <label className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={allSelected} disabled={!sendable.length} onChange={() => setSelected(allSelected ? new Set() : new Set(sendable.map((item) => item.allocationId)))} />
          Выбрать все ({sendable.length})
        </label>
        <ul className="divide-y divide-border/60">
          {preview.items.map((item) => {
            const action = ACTION_LABEL[item.action];
            return <li key={item.allocationId} className="flex items-start gap-2.5 px-4 py-2.5 text-xs">
              <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-primary" aria-label={`Отправить ${item.roleName} · ${item.personName}`} disabled={item.action === 'skip'} checked={selected.has(item.allocationId)} onChange={() => toggle(item.allocationId)} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-semibold ${action.className}`}>{action.label}</span>
                  <span className="truncate font-medium text-foreground" title={item.workItemTitle}>#{item.workItemExternalId} {item.workItemTitle}</span>
                </div>
                <p className="text-muted-foreground">
                  {item.roleName} · {item.personName}{item.assignee ? ` (${item.assignee})` : ''} · {item.quarterKey.replace(/^(\d{4})-(Q\d)$/, '$2 $1')} ·{' '}
                  {item.action === 'update' && item.pushedHours !== null && item.pushedHours !== item.estimatedHours
                    ? <span className="font-medium text-foreground">{item.pushedHours} → {item.estimatedHours} ч</span>
                    : <span className="font-medium text-foreground">{item.estimatedHours} ч</span>}
                </p>
                {item.taskTitle ? <p className="truncate text-muted-foreground" title={item.taskTitle}>Название: «{item.taskTitle}»</p> : null}
                {item.action === 'update' ? <p className="text-muted-foreground">Task #{item.azureTaskId}</p> : null}
                {item.skipReason ? <p className="text-amber-700 dark:text-amber-300">{item.skipReason}</p> : null}
                {item.error ? <p className="break-words text-destructive">Прошлая ошибка: {item.error}</p> : null}
              </div>
            </li>;
          })}
        </ul>
      </div> : <p className="px-4 py-6 text-center text-sm text-muted-foreground">Всё уже в Azure DevOps — отправлять нечего.</p>}

      {error ? <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">{error instanceof Error ? error.message : 'Не удалось отправить'}</p> : null}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Отправка идёт в фоне, статусы обновятся на странице плана.</p>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" disabled={!selected.size || pushMutation.isPending || preview.mode === 'off' || !preview.projectAllowed} onClick={() => pushMutation.mutate()}>
          {pushMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
          Отправить ({selected.size})
        </Button>
      </div>
    </div>
  );
}
