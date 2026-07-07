'use client';

import { ChevronRight } from 'lucide-react';
import type { AdminRouteTemplateStep } from '@/entities/admin/api/adminApi';
import { cn } from '@/shared/lib/utils';

const ASSIGNEE_LABELS: Record<string, string> = {
  manager_chain: 'Руководитель',
  role: 'Роль',
  user: 'Пользователь',
  org_unit_head: 'Рук. подразделения',
  dynamic: 'Из поля',
};

export function RouteFlowPreview({
  steps,
  className,
}: {
  steps: AdminRouteTemplateStep[];
  className?: string;
}) {
  if (steps.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        Выберите маршрут или добавьте шаги в разделе «Маршруты».
      </p>
    );
  }

  return (
    <div className={cn('overflow-x-auto pb-1', className)}>
      <div className="flex min-w-max items-stretch gap-2">
        {steps.map((step, index) => (
          <div key={step.order} className="flex items-center gap-2">
            <div className="flex w-[168px] flex-col rounded-xl border border-border/80 bg-muted/20 px-3 py-3 dark:bg-muted/10">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Шаг {index + 1}
              </span>
              <p className="mt-1 text-sm font-medium leading-snug">{step.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ASSIGNEE_LABELS[step.assigneeType] ?? step.assigneeType}
                {step.assigneeRef && step.assigneeType !== 'org_unit_head'
                  ? ` · ${step.assigneeRef}`
                  : ''}
              </p>
              {step.slaHours ? (
                <p className="mt-1 text-xs text-muted-foreground">SLA {step.slaHours}ч</p>
              ) : null}
            </div>
            {index < steps.length - 1 ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
