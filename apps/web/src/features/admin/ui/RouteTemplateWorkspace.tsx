'use client';

import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Rocket,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreateAdminRouteTemplateInput } from '@/entities/admin/api/adminApi';
import { RouteCanvasEditor } from '@/features/admin/ui/route-canvas/RouteCanvasEditor';
import { RouteStepInspector } from '@/features/admin/ui/route-canvas/RouteStepInspector';
import {
  collectRouteStepIssues,
  type RouteStepFormValue,
} from '@/features/admin/ui/RouteStepEditor';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

const MAX_STEPS = 15;
const HINT_STORAGE_KEY = 'tracker:route-editor-hint-seen';

interface RouteTemplateWorkspaceProps {
  title: string;
  statusLabel?: string;
  initialName: string;
  initialSteps: RouteStepFormValue[];
  onCancel: () => void;
  onSubmit: (payload: CreateAdminRouteTemplateInput) => void;
  isPending: boolean;
  /** Server-side error from the last save attempt */
  submitError?: string | null;
  onPublish?: () => void;
  isPublishing?: boolean;
}

function newStep(order: number): RouteStepFormValue {
  return {
    order,
    name: '',
    assigneeType: 'manager_chain',
    assigneeRef: '1',
    actions: ['approve', 'reject'],
    slaHours: 24,
  };
}

function reorder(steps: RouteStepFormValue[]) {
  return steps.map((step, order) => ({ ...step, order }));
}

export function RouteTemplateWorkspace({
  title,
  statusLabel = 'Черновик',
  initialName,
  initialSteps,
  onCancel,
  onSubmit,
  isPending,
  submitError,
  onPublish,
  isPublishing = false,
}: RouteTemplateWorkspaceProps) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState(() => reorder(initialSteps));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialSteps.length > 0 ? 0 : null,
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const baseline = useRef(JSON.stringify({ name: initialName, steps: reorder(initialSteps) }));

  const isDirty = JSON.stringify({ name, steps }) !== baseline.current;

  const issues = useMemo(() => collectRouteStepIssues(steps), [steps]);
  const nameIssue = name.trim() ? null : 'Укажите название маршрута';
  const allIssues = useMemo(
    () => (nameIssue ? [{ index: null, message: nameIssue }, ...issues] : issues),
    [nameIssue, issues],
  );
  const invalidIndexes = useMemo(
    () =>
      new Set(
        allIssues
          .map((issue) => issue.index)
          .filter((index): index is number => index !== null),
      ),
    [allIssues],
  );

  const selectedStep = selectedIndex !== null ? (steps[selectedIndex] ?? null) : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(HINT_STORAGE_KEY)) return;
    setHintVisible(true);
  }, []);

  const dismissHint = () => {
    setHintVisible(false);
    window.localStorage.setItem(HINT_STORAGE_KEY, '1');
  };

  // Warn on tab close while there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const updateStep = (index: number, step: RouteStepFormValue) => {
    setSteps((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? step : item)),
    );
  };

  const insertStep = useCallback((at: number) => {
    setSteps((current) => {
      if (current.length >= MAX_STEPS) return current;
      const next = [...current];
      next.splice(at, 0, newStep(at));
      return reorder(next);
    });
    setSelectedIndex(at);
    setInspectorOpen(true);
  }, []);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction;
    setSteps((current) => {
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return reorder(next);
    });
    setSelectedIndex((current) => (current === index ? target : current));
  }, []);

  const deleteStep = useCallback((index: number) => {
    setSteps((current) => {
      if (current.length <= 1) return current;
      return reorder(current.filter((_, itemIndex) => itemIndex !== index));
    });
    setSelectedIndex((current) => {
      if (current === null) return null;
      if (current === index) return Math.max(0, index - 1);
      if (current > index) return current - 1;
      return current;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (isPending) return;

    if (allIssues.length > 0) {
      setShowErrors(true);
      const firstStepIssue = allIssues.find((issue) => issue.index !== null);
      if (!name.trim()) {
        nameInputRef.current?.focus();
      } else if (firstStepIssue?.index != null) {
        setSelectedIndex(firstStepIssue.index);
        setInspectorOpen(true);
      }
      return;
    }

    setShowErrors(false);
    onSubmit({ name: name.trim(), steps: reorder(steps) });
  }, [allIssues, isPending, name, onSubmit, steps]);

  const handleCancel = () => {
    if (isDirty && !confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    onCancel();
  };

  // Keyboard: Ctrl/Cmd+S save, Esc deselect, Delete removes the selected step.
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      );
    };

    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
        return;
      }
      if (event.key === 'Escape') {
        setSelectedIndex(null);
        return;
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !isEditable(event.target) &&
        selectedIndex !== null &&
        steps.length > 1
      ) {
        event.preventDefault();
        deleteStep(selectedIndex);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteStep, handleSave, selectedIndex, steps.length]);

  const canAddStep = steps.length < MAX_STEPS;
  const bannerIssues = showErrors ? allIssues : [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
            <ArrowLeft className="h-4 w-4" />
            Маршруты
          </Button>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <span className="inline-flex rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {statusLabel}
          </span>
          {isDirty ? (
            <span className="text-xs text-muted-foreground">Есть несохранённые изменения</span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {onPublish ? (
              <Button
                variant="outline"
                onClick={onPublish}
                disabled={isPublishing || isPending || isDirty}
                title={isDirty ? 'Сначала сохраните черновик' : undefined}
              >
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Опубликовать
              </Button>
            ) : null}
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить черновик
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-border/70 px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-md">
            <Label htmlFor="route-name" className="text-xs text-muted-foreground">
              Название маршрута
            </Label>
            <Input
              id="route-name"
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Стандартное согласование"
              aria-invalid={(showErrors && Boolean(nameIssue)) || undefined}
              className={cn(
                showErrors && nameIssue && 'border-destructive focus-visible:ring-destructive/40',
              )}
            />
          </div>

          <div className="flex items-center gap-2 pb-0.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => insertStep(steps.length)}
              disabled={!canAddStep}
              title={canAddStep ? undefined : `Максимум ${MAX_STEPS} шагов`}
            >
              <Plus className="h-4 w-4" />
              Добавить шаг
            </Button>
            <span className="text-xs text-muted-foreground">
              {steps.length} из {MAX_STEPS}
            </span>
          </div>
        </div>

        {bannerIssues.length > 0 || submitError ? (
          <div className="border-t border-destructive/30 bg-destructive/8 px-4 py-2.5 md:px-6">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                {submitError ? <p>{submitError}</p> : null}
                {bannerIssues.slice(0, 3).map((issue, index) => (
                  <button
                    key={`${issue.index}-${index}`}
                    type="button"
                    className="block text-left underline-offset-2 hover:underline"
                    onClick={() => {
                      if (issue.index === null) {
                        nameInputRef.current?.focus();
                        return;
                      }
                      setSelectedIndex(issue.index);
                      setInspectorOpen(true);
                    }}
                  >
                    {issue.message}
                  </button>
                ))}
                {bannerIssues.length > 3 ? (
                  <p className="text-xs text-destructive/80">
                    и ещё {bannerIssues.length - 3}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {confirmingCancel ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/40 px-4 py-2.5 text-sm md:px-6 dark:bg-muted/20">
            <span>Изменения не сохранены. Выйти из редактора?</span>
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)}>
              Остаться
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Выйти без сохранения
            </Button>
          </div>
        ) : null}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <RouteCanvasEditor
            steps={steps}
            selectedIndex={selectedIndex}
            onSelectStep={(index) => {
              setSelectedIndex(index);
              if (index !== null) setInspectorOpen(true);
            }}
            invalidIndexes={showErrors ? invalidIndexes : undefined}
            onInsertStep={canAddStep ? insertStep : undefined}
            onMoveStep={moveStep}
          />

          {hintVisible ? (
            <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
              <span>Цепочка слева направо. Выберите шаг — настройки справа.</span>
              <button
                type="button"
                onClick={dismissHint}
                className="font-medium text-primary hover:underline"
              >
                Понятно
              </button>
            </div>
          ) : null}

          {!inspectorOpen ? (
            <Button
              variant="outline"
              size="sm"
              className="absolute right-4 top-4 z-10"
              onClick={() => setInspectorOpen(true)}
            >
              <PanelRightOpen className="h-4 w-4" />
              {selectedIndex !== null ? `Шаг ${selectedIndex + 1}` : 'Настройки'}
            </Button>
          ) : null}
        </div>

        {inspectorOpen ? (
          <aside
            className={cn(
              'z-10 flex flex-col border-border bg-card',
              'absolute inset-x-0 bottom-0 max-h-[55%] border-t',
              'xl:relative xl:inset-auto xl:max-h-none xl:w-[380px] xl:shrink-0 xl:border-l xl:border-t-0',
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                {selectedStep && selectedIndex !== null
                  ? `Шаг ${selectedIndex + 1}`
                  : 'Настройки шага'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setInspectorOpen(false)}
                aria-label="Свернуть панель настроек"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              {selectedStep && selectedIndex !== null ? (
                <RouteStepInspector
                  key={selectedIndex}
                  step={selectedStep}
                  stepIndex={selectedIndex}
                  onChange={(step) => updateStep(selectedIndex, step)}
                  onDelete={() => deleteStep(selectedIndex)}
                  canDelete={steps.length > 1}
                  showErrors={showErrors}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Выберите шаг на схеме</p>
                  <p className="text-sm text-muted-foreground">
                    Заявка проходит шаги последовательно слева направо. Каждый шаг — один
                    круг согласования: кому назначается, за какой срок и какие действия
                    доступны.
                  </p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li>• Кнопка + на связи — вставить шаг между соседними</li>
                    <li>• Стрелки под нодой — поменять порядок</li>
                    <li>• Del — удалить выбранный шаг, Ctrl/⌘+S — сохранить</li>
                  </ul>
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
