'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '@/entities/user/api/authApi';
import { usersApi } from '@/entities/user/api/usersApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export interface PersonalRouteStepForm {
  name: string;
  assigneeUserId: string;
  slaHours: number | null;
}

interface PersonalRouteBuilderProps {
  steps: PersonalRouteStepForm[];
  onChange: (steps: PersonalRouteStepForm[]) => void;
  maxSteps: number;
  currentUser: AuthUser | null;
}

function emptyStep(index: number, managerId?: string | null): PersonalRouteStepForm {
  return {
    name: index === 0 ? 'Согласование руководителя' : `Согласование ${index + 1}`,
    assigneeUserId: index === 0 ? managerId ?? '' : '',
    slaHours: 24,
  };
}

export function createDefaultPersonalSteps(
  currentUser: AuthUser | null,
): PersonalRouteStepForm[] {
  return [emptyStep(0, currentUser?.manager?.id)];
}

export function validatePersonalRouteSteps(
  steps: PersonalRouteStepForm[],
  maxSteps: number,
  currentUserId?: string | null,
): string | null {
  if (steps.length < 1) {
    return 'Добавьте хотя бы одного согласующего';
  }
  if (steps.length > maxSteps) {
    return `Максимум шагов: ${maxSteps}`;
  }

  for (const [index, step] of steps.entries()) {
    if (!step.name.trim()) {
      return `Шаг ${index + 1}: укажите название`;
    }
    if (!step.assigneeUserId) {
      return `Шаг ${index + 1}: выберите согласующего`;
    }
    if (currentUserId && step.assigneeUserId === currentUserId) {
      return `Шаг ${index + 1}: нельзя назначить себя`;
    }
    if (index > 0 && steps[index - 1]?.assigneeUserId === step.assigneeUserId) {
      return `Шаг ${index + 1}: нельзя ставить одного и того же человека подряд`;
    }
  }

  return null;
}

export function PersonalRouteBuilder({
  steps,
  onChange,
  maxSteps,
  currentUser,
}: PersonalRouteBuilderProps) {
  const usersQuery = useQuery({
    queryKey: queryKeys.users.directory(),
    queryFn: () => usersApi.list(),
    staleTime: 60_000,
  });

  const users = (usersQuery.data?.data ?? []).filter(
    (user) => user.id !== currentUser?.id,
  );

  const updateStep = (index: number, patch: Partial<PersonalRouteStepForm>) => {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const addStep = () => {
    if (steps.length >= maxSteps) return;
    onChange([...steps, emptyStep(steps.length)]);
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      name: step.name || `Согласование ${i + 1}`,
    })));
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Свой маршрут согласования</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Укажите, кому по очереди отправится запрос. Максимум {maxSteps} шагов.
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={index}
            className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Шаг {index + 1}
              </span>
              {steps.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStep(index)}
                  className="h-7 px-2 text-muted-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`personal-step-name-${index}`}>Название шага</Label>
              <Input
                id={`personal-step-name-${index}`}
                value={step.name}
                onChange={(event) => updateStep(index, { name: event.target.value })}
                placeholder="Согласование руководителя"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`personal-step-user-${index}`}>Согласующий</Label>
              <select
                id={`personal-step-user-${index}`}
                value={step.assigneeUserId}
                onChange={(event) =>
                  updateStep(index, { assigneeUserId: event.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">— Выберите сотрудника —</option>
                {currentUser?.manager ? (
                  <option value={currentUser.manager.id}>
                    {currentUser.manager.fullName} (мой руководитель)
                  </option>
                ) : null}
                {users
                  .filter((user) => user.id !== currentUser?.manager?.id)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
              </select>
            </div>
          </li>
        ))}
      </ol>

      {steps.length < maxSteps ? (
        <Button type="button" variant="outline" size="sm" onClick={addStep}>
          <Plus className="h-4 w-4" />
          Добавить согласующего
        </Button>
      ) : null}
    </div>
  );
}
