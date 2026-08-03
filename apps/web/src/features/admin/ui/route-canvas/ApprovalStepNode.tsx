'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageCircleQuestion,
  Users,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { ApprovalStepNodeData } from '@/features/admin/ui/route-canvas/route-canvas-utils';
import { NODE_WIDTH } from '@/features/admin/ui/route-canvas/route-canvas-utils';
import { cn } from '@/shared/lib/utils';

const ASSIGNEE_LABELS: Record<string, string> = {
  manager_chain: 'Руководитель',
  role: 'Роль',
  user: 'Пользователь',
  org_unit_head: 'Рук. подразделения',
  dynamic: 'Из поля формы',
};

const ACTION_META: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  approve: { icon: Check, label: 'Согласовать' },
  reject: { icon: X, label: 'Отклонить' },
  escalate: { icon: ArrowUpRight, label: 'Эскалировать' },
  request_info: { icon: MessageCircleQuestion, label: 'Уточнение' },
};

function assigneeSummary(assigneeType: string, assigneeRef: string) {
  const base = ASSIGNEE_LABELS[assigneeType] ?? assigneeType;
  if (assigneeType === 'org_unit_head') return base;
  if (assigneeType === 'manager_chain') return `${base} · уровень ${assigneeRef || '—'}`;
  return assigneeRef ? `${base} · ${assigneeRef}` : base;
}

export function ApprovalStepNode({ data }: NodeProps) {
  const { step, index, total, selected, invalid, interactive, onMove } =
    data as ApprovalStepNodeData;

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card px-4 py-3.5 transition-colors',
        'shadow-[0_1px_2px_hsl(var(--foreground)/0.05),0_6px_16px_-8px_hsl(var(--foreground)/0.18)] dark:shadow-none',
        invalid
          ? 'border-destructive/70 ring-2 ring-destructive/20'
          : selected
            ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/25 dark:bg-primary/[0.08]'
            : 'border-border hover:border-primary/45',
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-border"
      />

      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold',
            selected && !invalid
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground dark:bg-muted/40',
          )}
        >
          {index + 1}
        </span>
        {invalid ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            Не заполнен
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {index === 0 ? 'Старт' : index === total - 1 ? 'Финал' : 'Шаг'}
          </span>
        )}
      </div>

      <p
        className={cn(
          'mt-2 truncate text-sm font-semibold',
          step.name.trim() ? 'text-foreground' : 'text-muted-foreground italic',
        )}
        title={step.name || undefined}
      >
        {step.name.trim() || 'Без названия'}
      </p>

      <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{assigneeSummary(step.assigneeType, step.assigneeRef)}</span>
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {step.slaHours ? `${step.slaHours} ч` : 'без SLA'}
        </span>
        <div className="flex items-center gap-1">
          {step.actions.map((action) => {
            const meta = ACTION_META[action];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <span
                key={action}
                title={meta.label}
                className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground dark:bg-muted/40"
              >
                <Icon className="h-3 w-3" />
              </span>
            );
          })}
        </div>
      </div>

      {interactive && onMove && total > 1 ? (
        <div
          className={cn(
            'nodrag nopan absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card p-0.5 opacity-0 shadow-sm transition-opacity',
            'group-hover:opacity-100 focus-within:opacity-100',
            selected && 'opacity-100',
          )}
        >
          <button
            type="button"
            aria-label="Переместить шаг левее"
            disabled={index === 0}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            onClick={(event) => {
              event.stopPropagation();
              onMove(index, -1);
            }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Переместить шаг правее"
            disabled={index === total - 1}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            onClick={(event) => {
              event.stopPropagation();
              onMove(index, 1);
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-border"
      />
    </div>
  );
}
