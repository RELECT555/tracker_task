'use client';

import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock3, ExternalLink, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { allocationAzureApi } from '@/entities/roadmap/api/allocationAzureApi';
import type { RoadmapAllocation, RoadmapProjectPlan } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const hours = (value: number | string | null | undefined) => `${hoursFormat.format(Number(value ?? 0) || 0)} ч`;

const statusLook: Record<string, { label: string; dot: string; tone?: string }> = {
  synced: { label: 'В Azure', dot: 'bg-emerald-500' },
  pending: { label: 'Ждёт отправки', dot: 'bg-amber-500' },
  sending: { label: 'Отправляется', dot: 'bg-sky-500 animate-pulse motion-reduce:animate-none' },
  error: { label: 'Ошибка отправки', dot: 'bg-destructive', tone: 'text-destructive' },
  conflict: { label: 'Расходится с Azure', dot: 'bg-amber-500', tone: 'text-amber-700 dark:text-amber-300' },
  skipped: { label: 'Не отправляется', dot: 'bg-muted-foreground/40' },
};

/** Stops Enter inside the panel from submitting the allocation form it sits in. */
function onEnter(action: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    action();
  };
}

/**
 * The Azure DevOps side of one allocation: sync status, the Task link, logging time on the Task,
 * resolving a divergence with Azure, and sending again.
 */
export function AllocationAzurePanel({ allocation, canEditPlan, writeEnabled = true, compact = false, onRetry, retrying = false, onOpenTask, className }: {
  allocation: RoadmapAllocation;
  canEditPlan: boolean;
  /** The row above already shows status and hours: show only the Task, problems and actions. */
  compact?: boolean;
  /** Write-back is on: time can be logged and conflicts resolved. */
  writeEnabled?: boolean;
  /** Sends the plan's values to Azure again; also "keep the plan" in a conflict. */
  onRetry?: () => void;
  retrying?: boolean;
  /** Opens the Task inside Roadmap; falls back to the Azure link. */
  onOpenTask?: (taskId: string) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [logging, setLogging] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [comment, setComment] = useState('');
  const refreshPlan = () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] });

  const logTime = useMutation({
    mutationFn: () => allocationAzureApi.logTime(allocation.id, Number(logHours), comment),
    onSuccess: async () => {
      setLogging(false);
      setLogHours('');
      setComment('');
      await refreshPlan();
    },
  });
  const accept = useMutation({
    mutationFn: () => allocationAzureApi.acceptFromAzure(allocation.id),
    onSuccess: refreshPlan,
  });

  const status = allocation.azureSyncStatus ?? null;
  const look = statusLook[status ?? ''] ?? { label: 'Ещё не отправлено', dot: 'bg-muted-foreground/40' };
  const isAssignee = Boolean(user?.email && allocation.personEmail && user.email.toLowerCase() === allocation.personEmail.toLowerCase());
  const canLog = writeEnabled && Boolean(allocation.azureTaskId) && (isAssignee || canEditPlan);
  const validHours = Number(logHours) >= 0.25 && Number(logHours) <= 200;
  const submitLog = () => { if (validHours && !logTime.isPending) logTime.mutate(); };
  const busy = retrying || accept.isPending;

  const taskLink = allocation.azureTaskId ? (
    onOpenTask
      ? <button type="button" onClick={() => onOpenTask(allocation.azureTaskId!)} className="shrink-0 rounded text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Task {allocation.azureTaskId}</button>
      : allocation.azureTaskUrl ? <a href={allocation.azureTaskUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline">Task {allocation.azureTaskId}<ExternalLink aria-hidden="true" className="size-3" /></a> : null
  ) : null;

  return <div className={cn('space-y-2 text-xs', !compact && 'rounded-lg border border-border px-3 py-2.5', className)}>
    {compact ? <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
      {taskLink ?? <span>Задача в Azure DevOps ещё не создана</span>}
      {allocation.azureTaskState ? <span>· {allocation.azureTaskState}</span> : null}
    </p> : <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground', look.tone)}>
          <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', look.dot)} />{look.label}
        </span>
        {taskLink}
      </div>
      <p className="tabular-nums text-muted-foreground">
        План {hours(allocation.estimatedHours)} · факт {hours(allocation.actualHours)}{allocation.azureTaskState ? ` · ${allocation.azureTaskState}` : ''}
      </p>
    </>}
    {allocation.azureSyncError ? <p className={cn('break-words', status === 'conflict' ? 'text-foreground' : 'text-destructive')}>{allocation.azureSyncError}</p> : null}

    {status === 'conflict' && canEditPlan && writeEnabled ? <div className="flex flex-wrap gap-1.5">
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => accept.mutate()}>{accept.isPending ? 'Принимаем…' : 'Принять из Azure'}</Button>
      {onRetry ? <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onRetry}>Оставить план</Button> : null}
    </div> : null}
    {status !== 'conflict' && onRetry && status !== 'synced' && status !== 'pending' && status !== 'sending' ? (
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onRetry}>{retrying ? 'Отправляем…' : 'Отправить снова'}</Button>
    ) : null}
    {accept.error ? <p role="alert" className="text-destructive">{accept.error.message}</p> : null}

    {canLog ? (logging ? <div className="space-y-1.5 border-t border-border pt-2">
      <div className="flex items-center gap-1.5">
        <div className="relative w-20 shrink-0">
          <input
            autoFocus
            aria-label="Часы"
            type="number"
            inputMode="decimal"
            min="0.25"
            max="200"
            step="0.25"
            value={logHours}
            onChange={(event) => setLogHours(event.target.value)}
            onKeyDown={onEnter(submitLog)}
            placeholder="0"
            className="h-7 w-full rounded-md border border-input bg-field pl-2 pr-5 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground">ч</span>
        </div>
        <input
          aria-label="Комментарий к списанию"
          value={comment}
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          onKeyDown={onEnter(submitLog)}
          placeholder="Что сделано (необязательно)"
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-field px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Button type="button" size="sm" className="h-7 text-xs" disabled={!validHours || logTime.isPending} onClick={submitLog}>{logTime.isPending ? 'Списываем…' : 'Списать'}</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={logTime.isPending} onClick={() => { setLogging(false); logTime.reset(); }}>Отмена</Button>
        <span className="ml-auto text-muted-foreground">В Completed Work задачи</span>
      </div>
      {logTime.error ? <p role="alert" className="text-destructive">{logTime.error.message}</p> : null}
    </div> : <Button type="button" size="sm" variant="ghost" className="-ml-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setLogging(true)}>
      <Clock3 aria-hidden="true" className="size-3.5" />Списать время
    </Button>) : null}
  </div>;
}

const removalText: Record<string, string> = {
  keep: 'Задача в Azure DevOps останется.',
  'set-state': 'Задача в Azure DevOps будет переведена в состояние «{state}».',
  delete: 'Задача в Azure DevOps уйдёт в корзину.',
};

/** Deletes an allocation after a confirmation that says what happens to its Task. */
export function DeleteAllocationButton({ allocation, removal, onDeleted }: {
  allocation: RoadmapAllocation;
  removal?: NonNullable<RoadmapProjectPlan['azure']>['removal'];
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => allocationAzureApi.remove(allocation.id),
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] });
      onDeleted?.();
    },
  });
  const action = removal?.action ?? 'keep';
  if (!confirming) {
    return <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
      <Trash2 aria-hidden="true" className="size-3.5" />Удалить
    </Button>;
  }
  return <div role="alertdialog" aria-label="Удалить назначение?" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
    <span className="min-w-0 flex-1 text-muted-foreground">
      {allocation.azureTaskId ? removalText[action].replace('{state}', removal?.state || 'Removed') : 'Удалить назначение?'}
      {remove.error ? <span role="alert" className="block text-destructive">{remove.error.message}</span> : null}
    </span>
    <Button type="button" size="sm" variant="destructive" className="h-7 text-xs" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? 'Удаляем…' : 'Удалить'}</Button>
    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={remove.isPending} onClick={() => { setConfirming(false); remove.reset(); }}>Нет</Button>
  </div>;
}
