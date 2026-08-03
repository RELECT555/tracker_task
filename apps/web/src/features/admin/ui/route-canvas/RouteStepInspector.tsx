'use client';

import { Trash2 } from 'lucide-react';
import { ASSIGNEE_TYPES, ROUTE_STEP_ACTIONS } from '@tracker/shared';
import type { RouteStepFormValue } from '@/features/admin/ui/RouteStepEditor';
import { cn } from '@/shared/lib/utils';
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
  manager_chain: '1 = прямой руководитель, 2 = уровнем выше',
  role: 'Код роли: admin, manager, director',
  user: 'UUID пользователя',
  org_unit_head: 'Не требуется',
  dynamic: 'field:имя_поля',
};

const REF_LABELS: Record<string, string> = {
  manager_chain: 'Уровень',
  role: 'Код роли',
  user: 'Пользователь',
  org_unit_head: 'Параметр',
  dynamic: 'Поле формы',
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

interface RouteStepInspectorProps {
  step: RouteStepFormValue;
  stepIndex: number;
  onChange: (step: RouteStepFormValue) => void;
  onDelete: () => void;
  canDelete: boolean;
  /** Highlight fields that failed validation on the last save attempt */
  showErrors?: boolean;
}

export function RouteStepInspector({
  step,
  stepIndex,
  onChange,
  onDelete,
  canDelete,
  showErrors = false,
}: RouteStepInspectorProps) {
  const refRequired = step.assigneeType !== 'org_unit_head';
  const nameError = showErrors && !step.name.trim();
  const refError = showErrors && refRequired && !step.assigneeRef.trim();
  const actionsError = showErrors && step.actions.length === 0;

  return (
    <div className="space-y-6">
      <Section title="Основные">
        <div className="space-y-2">
          <Label htmlFor="step-name">Название шага</Label>
          <Input
            id="step-name"
            value={step.name}
            placeholder="Согласование руководителя"
            aria-invalid={nameError || undefined}
            className={cn(nameError && 'border-destructive focus-visible:ring-destructive/40')}
            onChange={(event) => onChange({ ...step, name: event.target.value })}
          />
          {nameError ? (
            <p className="text-xs text-destructive">Укажите название шага</p>
          ) : null}
        </div>
      </Section>

      <Section title="Назначение">
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
              {ASSIGNEE_TYPES.filter((type) => type !== 'pool').map((type) => (
                <SelectItem key={type} value={type}>
                  {ASSIGNEE_LABELS[type] ?? type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="step-ref">{REF_LABELS[step.assigneeType] ?? 'Параметр'}</Label>
          <Input
            id="step-ref"
            value={step.assigneeRef}
            disabled={!refRequired}
            aria-invalid={refError || undefined}
            className={cn(refError && 'border-destructive focus-visible:ring-destructive/40')}
            onChange={(event) => onChange({ ...step, assigneeRef: event.target.value })}
          />
          <p className={cn('text-xs', refError ? 'text-destructive' : 'text-muted-foreground')}>
            {refError ? 'Задайте параметр назначения' : (REF_HINTS[step.assigneeType] ?? '')}
          </p>
        </div>
      </Section>

      <Section title="Срок">
        <div className="space-y-2">
          <Label htmlFor="step-sla">SLA, часов</Label>
          <Input
            id="step-sla"
            type="number"
            min={1}
            placeholder="Без ограничения"
            value={step.slaHours ?? ''}
            onChange={(event) =>
              onChange({
                ...step,
                slaHours: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Пусто — шаг без контроля срока
          </p>
        </div>
      </Section>

      <Section title="Действия">
        <div className="grid grid-cols-2 gap-2">
          {ROUTE_STEP_ACTIONS.map((action) => {
            const checked = step.actions.includes(action);
            return (
              <label
                key={action}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  checked
                    ? 'border-primary/60 bg-primary/[0.06] text-foreground'
                    : 'border-border bg-field text-muted-foreground hover:border-primary/35',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const actions = event.target.checked
                      ? [...step.actions, action]
                      : step.actions.filter((item) => item !== action);
                    onChange({ ...step, actions });
                  }}
                  className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                />
                {ACTION_LABELS[action] ?? action}
              </label>
            );
          })}
        </div>
        {actionsError ? (
          <p className="text-xs text-destructive">Выберите хотя бы одно действие</p>
        ) : null}
      </Section>

      <section className="space-y-2 border-t border-border pt-5">
        <Button
          type="button"
          variant="outline"
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={!canDelete}
        >
          <Trash2 className="h-4 w-4" />
          Удалить шаг {stepIndex + 1}
        </Button>
        {!canDelete ? (
          <p className="text-xs text-muted-foreground">
            Маршрут должен содержать хотя бы один шаг
          </p>
        ) : null}
      </section>
    </div>
  );
}
