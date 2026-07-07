'use client';

import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import type { CreateAdminRouteTemplateInput } from '@/entities/admin/api/adminApi';
import { RouteCanvasEditor } from '@/features/admin/ui/route-canvas/RouteCanvasEditor';
import { RouteStepInspector } from '@/features/admin/ui/route-canvas/RouteStepInspector';
import {
  createDefaultRouteSteps,
  validateRouteStepEditor,
  type RouteStepFormValue,
} from '@/features/admin/ui/RouteStepEditor';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface RouteTemplateCanvasDesignerProps {
  title: string;
  initialName: string;
  initialSteps: RouteStepFormValue[];
  onCancel: () => void;
  onSubmit: (payload: CreateAdminRouteTemplateInput) => void;
  isPending: boolean;
}

function emptyStep(order: number): RouteStepFormValue {
  return {
    order,
    name: 'Новый шаг',
    assigneeType: 'manager_chain',
    assigneeRef: '1',
    actions: ['approve', 'reject'],
    slaHours: 24,
  };
}

export function RouteTemplateCanvasDesigner({
  title,
  initialName,
  initialSteps,
  onCancel,
  onSubmit,
  isPending,
}: RouteTemplateCanvasDesignerProps) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState(
    initialSteps.length > 0 ? initialSteps : createDefaultRouteSteps(),
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialSteps.length > 0 ? 0 : null,
  );
  const [error, setError] = useState<string | null>(null);

  const selectedStep = selectedIndex !== null ? steps[selectedIndex] : null;

  const updateStep = (index: number, step: RouteStepFormValue) => {
    setSteps((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? step : item)),
    );
  };

  const addStep = () => {
    const next = [...steps, emptyStep(steps.length)];
    setSteps(next);
    setSelectedIndex(next.length - 1);
  };

  const deleteStep = (index: number) => {
    if (steps.length <= 1) return;
    const next = steps
      .filter((_, itemIndex) => itemIndex !== index)
      .map((step, order) => ({ ...step, order }));
    setSteps(next);
    setSelectedIndex((current) => {
      if (current === null) return null;
      if (current === index) return Math.min(index, next.length - 1);
      if (current > index) return current - 1;
      return current;
    });
  };

  const handleSave = () => {
    setError(null);

    if (!name.trim()) {
      setError('Укажите название маршрута');
      return;
    }

    const stepsError = validateRouteStepEditor(steps);
    if (stepsError) {
      setError(stepsError);
      return;
    }

    onSubmit({
      name: name.trim(),
      steps: steps.map((step, index) => ({ ...step, order: index })),
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-0 p-0">
        <div className="border-b border-border px-5 py-4">
          <CardTitle className="text-lg">{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Кликните на шаг на канвасе — настройки справа. Цепочка идёт слева направо.
          </p>
        </div>

        {error ? (
          <div className="px-5 pt-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="route-canvas-name">Название маршрута</Label>
            <Input
              id="route-canvas-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Стандартное согласование"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4" />
              Добавить шаг
            </Button>
            <span className="text-xs text-muted-foreground">
              {steps.length} {steps.length === 1 ? 'шаг' : 'шагов'}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <RouteCanvasEditor
              steps={steps}
              selectedIndex={selectedIndex}
              onSelectStep={setSelectedIndex}
            />

            <aside className="rounded-xl border border-border bg-muted/15 p-4 dark:bg-muted/10">
              {selectedStep && selectedIndex !== null ? (
                <RouteStepInspector
                  step={selectedStep}
                  stepIndex={selectedIndex}
                  onChange={(step) => updateStep(selectedIndex, step)}
                  onDelete={() => deleteStep(selectedIndex)}
                  canDelete={steps.length > 1}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Выберите шаг на канвасе, чтобы изменить название, исполнителя и SLA.
                </p>
              )}
            </aside>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить черновик
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
              Отмена
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
