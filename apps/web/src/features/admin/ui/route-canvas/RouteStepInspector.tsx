'use client';

import { Trash2 } from 'lucide-react';
import { ASSIGNEE_TYPES, ROUTE_STEP_ACTIONS } from '@tracker/shared';
import type { RouteStepFormValue } from '@/features/admin/ui/RouteStepEditor';
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
  user: 'Пользователь',
  role: 'Роль',
  org_unit_head: 'Руководитель подразделения',
  manager_chain: 'Цепочка руководителей',
  dynamic: 'Из поля формы',
};

const ACTION_LABELS: Record<string, string> = {
  approve: 'Согласовать',
  reject: 'Отклонить',
  escalate: 'Эскалировать',
  request_info: 'Уточнение',
};

const REF_HINTS: Record<string, string> = {
  manager_chain: '1 = прямой руководитель',
  role: 'admin, manager, director',
  user: 'UUID пользователя',
  org_unit_head: 'Не требуется',
  dynamic: 'field:имя_поля',
};

interface RouteStepInspectorProps {
  step: RouteStepFormValue;
  stepIndex: number;
  onChange: (step: RouteStepFormValue) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export function RouteStepInspector({
  step,
  stepIndex,
  onChange,
  onDelete,
  canDelete,
}: RouteStepInspectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Шаг {stepIndex + 1}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={!canDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Название</Label>
        <Input
          value={step.name}
          placeholder="Согласование руководителя"
          onChange={(event) => onChange({ ...step, name: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Кому назначать</Label>
        <Select
          value={step.assigneeType}
          onValueChange={(assigneeType) =>
            onChange({
              ...step,
              assigneeType,
              assigneeRef:
                assigneeType === 'org_unit_head'
                  ? '-'
                  : assigneeType === 'manager_chain'
                    ? '1'
                    : step.assigneeRef,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNEE_TYPES.filter((type) => type !== 'pool').map((type) => (
              <SelectItem key={type} value={type}>
                {ASSIGNEE_LABELS[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Параметр</Label>
        <Input
          value={step.assigneeRef}
          disabled={step.assigneeType === 'org_unit_head'}
          onChange={(event) => onChange({ ...step, assigneeRef: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {REF_HINTS[step.assigneeType] ?? ''}
        </p>
      </div>

      <div className="space-y-2">
        <Label>SLA (часы)</Label>
        <Input
          type="number"
          min={1}
          value={step.slaHours ?? ''}
          onChange={(event) =>
            onChange({
              ...step,
              slaHours: event.target.value ? Number(event.target.value) : null,
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Действия</Label>
        <div className="flex flex-wrap gap-2">
          {ROUTE_STEP_ACTIONS.map((action) => (
            <label key={action} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={step.actions.includes(action)}
                onChange={(event) => {
                  const actions = event.target.checked
                    ? [...step.actions, action]
                    : step.actions.filter((item) => item !== action);
                  onChange({ ...step, actions });
                }}
                className="h-3.5 w-3.5 rounded border-input"
              />
              {ACTION_LABELS[action] ?? action}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
