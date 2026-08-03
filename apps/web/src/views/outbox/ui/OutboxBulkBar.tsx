'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Send, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { requestApi, type RequestListItem } from '@/entities/request/api/requestApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

type BulkOperation = 'cancel' | 'submit';

interface FailedItem {
  title: string;
  message: string;
}

type BarMode =
  | { kind: 'idle' }
  | { kind: 'confirm'; operation: BulkOperation }
  | { kind: 'running'; operation: BulkOperation; done: number; total: number };

const CANCELLABLE = ['draft', 'submitted', 'in_progress', 'pending_info'];

const operationLabels: Record<BulkOperation, { verb: string; past: string }> = {
  cancel: { verb: 'Отменить', past: 'отменено' },
  submit: { verb: 'Отправить', past: 'отправлено' },
};

function reportResult(operation: BulkOperation, succeeded: number, failed: FailedItem[]) {
  const past = operationLabels[operation].past;

  if (failed.length === 0) {
    toast.success(`Успешно ${past}: ${succeeded}`);
    return;
  }

  const details = failed.map((item) => `${item.title} — ${item.message}`).join('\n');

  if (succeeded === 0) {
    toast.error(`Не удалось выполнить: ${failed.length}`, { description: details });
    return;
  }

  toast.warning(`${past[0].toUpperCase()}${past.slice(1)}: ${succeeded}, с ошибкой: ${failed.length}`, {
    description: details,
  });
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(items: RequestListItem[]) {
  const header = ['Запрос', 'Тип', 'Статус', 'Приоритет', 'Автор', 'Создан', 'Завершён'];
  const rows = items.map((item) =>
    [
      item.title,
      item.type.name,
      item.status,
      item.priority,
      item.author.fullName,
      item.createdAt,
      item.completedAt ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  // BOM keeps Cyrillic readable when the file is opened in Excel
  const blob = new Blob([`﻿${[header.map(csvCell).join(','), ...rows].join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `requests-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function OutboxBulkBar({
  selected,
  onClear,
}: {
  selected: RequestListItem[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<BarMode>({ kind: 'idle' });
  const [reason, setReason] = useState('');

  const cancellable = useMemo(
    () => selected.filter((item) => CANCELLABLE.includes(item.status)),
    [selected],
  );
  const submittable = useMemo(
    () => selected.filter((item) => item.status === 'draft'),
    [selected],
  );

  useEffect(() => {
    if (selected.length === 0 && mode.kind === 'confirm') setMode({ kind: 'idle' });
  }, [selected.length, mode.kind]);

  if (selected.length === 0) return null;

  async function run(operation: BulkOperation) {
    const targets = operation === 'cancel' ? cancellable : submittable;
    if (targets.length === 0) return;

    setMode({ kind: 'running', operation, done: 0, total: targets.length });
    const failed: FailedItem[] = [];
    let succeeded = 0;

    for (const [index, item] of targets.entries()) {
      try {
        if (operation === 'cancel') {
          await requestApi.cancel(item.id, reason.trim() || undefined);
        } else {
          await requestApi.submit(item.id);
        }
        succeeded += 1;
      } catch (error) {
        failed.push({ title: item.title, message: (error as Error).message });
      }
      setMode({ kind: 'running', operation, done: index + 1, total: targets.length });
    }

    await queryClient.invalidateQueries({ queryKey: ['requests'] });
    setReason('');
    onClear();
    setMode({ kind: 'idle' });
    reportResult(operation, succeeded, failed);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6">
      <div
        className={cn(
          'animate-in slide-in-from-bottom-2 fade-in duration-300 pointer-events-auto',
          'max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg dark:shadow-black/40',
        )}
        role="region"
        aria-label="Массовые операции"
      >
        {mode.kind === 'running' && (
          <div className="h-0.5 w-full bg-primary/15">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.round((mode.done / mode.total) * 100)}%` }}
            />
          </div>
        )}

        <div className="flex max-w-full items-center gap-3 overflow-x-auto whitespace-nowrap p-2 pl-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-primary px-2 font-mono text-xs font-semibold tabular-nums text-primary-foreground">
                {selected.length}
              </span>
              <span className="text-sm font-medium">
                {mode.kind === 'running'
                  ? `${operationLabels[mode.operation].verb}… ${mode.done}/${mode.total}`
                  : mode.kind === 'confirm'
                    ? mode.operation === 'cancel'
                      ? `Отменить: ${cancellable.length}`
                      : `Отправить: ${submittable.length}`
                    : 'выбрано'}
              </span>
            </div>

            <div className="h-6 w-px shrink-0 bg-border" />

            {mode.kind === 'confirm' ? (
              <div className="flex items-center gap-2">
                {mode.operation === 'cancel' && (
                  <Input
                    autoFocus
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Причина отмены (необязательно)"
                    className="h-9 w-56 sm:w-64"
                  />
                )}
                <Button
                  size="sm"
                  variant={mode.operation === 'cancel' ? 'destructive' : 'default'}
                  onClick={() => void run(mode.operation)}
                >
                  Подтвердить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setMode({ kind: 'idle' })}
                >
                  Назад
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mode.kind === 'running' || submittable.length === 0}
                    onClick={() => setMode({ kind: 'confirm', operation: 'submit' })}
                    title={
                      submittable.length === 0
                        ? 'Среди выбранных нет черновиков'
                        : `Отправить черновиков: ${submittable.length}`
                    }
                  >
                    {mode.kind === 'running' && mode.operation === 'submit' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={1.75} />
                    )}
                    На согласование
                    {submittable.length > 0 && <CountPill value={submittable.length} />}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mode.kind === 'running' || cancellable.length === 0}
                    onClick={() => setMode({ kind: 'confirm', operation: 'cancel' })}
                    title={
                      cancellable.length === 0
                        ? 'Выбранные запросы уже завершены'
                        : `Отменить запросов: ${cancellable.length}`
                    }
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {mode.kind === 'running' && mode.operation === 'cancel' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" strokeWidth={1.75} />
                    )}
                    Отменить
                    {cancellable.length > 0 && <CountPill value={cancellable.length} />}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mode.kind === 'running'}
                    onClick={() => downloadCsv(selected)}
                    title="Выгрузить выбранные в CSV"
                  >
                    <Download className="h-4 w-4" strokeWidth={1.75} />
                    CSV
                  </Button>
                </div>

                <div className="h-6 w-px shrink-0 bg-border" />

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  disabled={mode.kind === 'running'}
                  onClick={onClear}
                  title="Снять выделение"
                  aria-label="Снять выделение"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

function CountPill({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}
