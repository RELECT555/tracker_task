'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import type { ApprovalStepNodeData } from '@/features/admin/ui/route-canvas/route-canvas-utils';
import { cn } from '@/shared/lib/utils';

const ASSIGNEE_LABELS: Record<string, string> = {
  manager_chain: 'Руководитель',
  role: 'Роль',
  user: 'Пользователь',
  org_unit_head: 'Рук. подразделения',
  dynamic: 'Из поля',
};

export function ApprovalStepNode({ data }: NodeProps) {
  const nodeData = data as ApprovalStepNodeData;
  const { step, index, selected } = nodeData;

  return (
    <div
      className={cn(
        'w-[220px] rounded-xl border-2 bg-card px-3 py-3 shadow-md transition-colors',
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/40',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <GitBranch className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Шаг {index + 1}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">
            {step.name || 'Без названия'}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {ASSIGNEE_LABELS[step.assigneeType] ?? step.assigneeType}
          </p>
          {step.slaHours ? (
            <p className="mt-0.5 text-xs text-muted-foreground">SLA {step.slaHours}ч</p>
          ) : null}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2" />
    </div>
  );
}
