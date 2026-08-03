'use client';

import { Plus, Trash2 } from 'lucide-react';
import { ASSIGNEE_TYPES, ROUTE_STEP_ACTIONS } from '@tracker/shared';
import type { AdminRouteTemplateStep } from '@/entities/admin/api/adminApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

const ASSIGNEE_LABELS: Record<string, string> = {
  user: 'Конкретный пользователь',
  role: 'Роль',
  org_unit_head: 'Руководитель подразделения',
  manager_chain: 'Цепочка руководителей',
  dynamic: 'Из поля формы',
};

const ASSIGNEE_TYPE_OPTIONS = ASSIGNEE_TYPES.filter((type) => type !== 'pool').map(
  (type) => ({
    value: type,
    label: ASSIGNEE_LABELS[type] ?? type,
  }),
);

const ACTION_LABELS: Record<string, string> = {
  approve: 'Согласовать',
  reject: 'Отклонить',
  escalate: 'Эскалировать',
  request_info: 'Запросить уточнение',
};

const REF_HINTS: Record<string, string> = {
  manager_chain: 'Уровень: 1 = прямой руководитель, 2 = выше',
  role: 'Код роли: admin, manager, director',
  user: 'UUID пользователя',
  org_unit_head: 'Не требуется (—)',
  dynamic: 'field:имя_поля',
};

export type RouteStepFormValue = AdminRouteTemplateStep;

function emptyStep(order: number): RouteStepFormValue {
  return {
    order,
    name: '',
    assigneeType: 'manager_chain',
    assigneeRef: '1',
    actions: ['approve', 'reject'],
    slaHours: 24,
  };
}

interface RouteStepEditorProps {
  value: RouteStepFormValue[];
  onChange: (value: RouteStepFormValue[]) => void;
}

export function RouteStepEditor({ value, onChange }: RouteStepEditorProps) {
  const updateStep = (index: number, patch: Partial<RouteStepFormValue>) => {
    onChange(
      value.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    );
  };

  const removeStep = (index: number) => {
    const next = value
      .filter((_, stepIndex) => stepIndex !== index)
      .map((step, stepIndex) => ({ ...step, order: stepIndex }));
    onChange(next);
  };

  const addStep = () => {
    onChange([...value, emptyStep(value.length)]);
  };

  return (
    <div className="space-y-4">
      {value.map((step, index) => (
        <div
          key={`step-${index}`}
          className="space-y-3 rounded-lg border border-border/70 bg-muted/15 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Шаг {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeStep(index)}
              disabled={value.length <= 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Название шага</Label>
              <Input
                value={step.name}
                placeholder="Согласование руководителя"
                onChange={(event) => updateStep(index, { name: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Кому назначать</Label>
              <Select
                value={step.assigneeType}
                onValueChange={(assigneeType) =>
                  updateStep(index, {
                    assigneeType,
                    assigneeRef:
                      assigneeType === 'org_unit_head'
                        ? '-'
                        : assigneeType === 'manager_chain'
                          ? '1'
                          : assigneeType === 'role'
                            ? 'admin'
                            : step.assigneeRef,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNEE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Параметр назначения</Label>
              <Input
                value={step.assigneeRef}
                disabled={step.assigneeType === 'org_unit_head'}
                onChange={(event) => updateStep(index, { assigneeRef: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {REF_HINTS[step.assigneeType] ?? 'Идентификатор или код'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>SLA (часы)</Label>
              <Input
                type="number"
                min={1}
                value={step.slaHours ?? ''}
                onChange={(event) =>
                  updateStep(index, {
                    slaHours: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Доступные действия</Label>
            <div className="flex flex-wrap gap-3">
              {ROUTE_STEP_ACTIONS.map((action) => (
                <label key={action} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={step.actions.includes(action)}
                    onChange={(event) => {
                      const actions = event.target.checked
                        ? [...step.actions, action]
                        : step.actions.filter((item) => item !== action);
                      updateStep(index, { actions });
                    }}
                    className="h-4 w-4 rounded border-input"
                  />
                  {ACTION_LABELS[action] ?? action}
                </label>
              ))}
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addStep}>
        <Plus className="h-4 w-4" />
        Добавить шаг
      </Button>
    </div>
  );
}

export interface RouteStepIssue {
  /** Index of the offending step, or null for route-level issues */
  index: number | null;
  message: string;
}

export function collectRouteStepIssues(steps: RouteStepFormValue[]): RouteStepIssue[] {
  if (steps.length === 0) {
    return [{ index: null, message: 'Добавьте хотя бы один шаг маршрута' }];
  }

  const issues: RouteStepIssue[] = [];

  for (const [index, step] of steps.entries()) {
    if (!step.name.trim()) {
      issues.push({ index, message: `Шаг ${index + 1}: укажите название` });
    }

    if (step.assigneeType !== 'org_unit_head' && !step.assigneeRef.trim()) {
      issues.push({
        index,
        message: `Шаг ${index + 1}: задайте параметр назначения`,
      });
    }

    if (step.actions.length === 0) {
      issues.push({ index, message: `Шаг ${index + 1}: выберите действия` });
    }
  }

  return issues;
}

export function validateRouteStepEditor(steps: RouteStepFormValue[]): string | null {
  return collectRouteStepIssues(steps)[0]?.message ?? null;
}

export function createDefaultRouteSteps(): RouteStepFormValue[] {
  return [emptyStep(0)];
}
