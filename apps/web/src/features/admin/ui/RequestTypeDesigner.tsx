'use client';

import { Eye, FileText, GitBranch, Loader2, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminRouteTemplate, CreateAdminRequestTypeInput } from '@/entities/admin/api/adminApi';
import type { FieldSchemaItem } from '@/entities/request-type/model/field-schema';
import { FieldSchemaForm } from '@/features/request-fields/ui/FieldSchemaForm';
import { useAuth } from '@/features/auth/model/useAuth';
import {
  FieldSchemaEditor,
  validateFieldSchemaEditor,
} from '@/features/admin/ui/FieldSchemaEditor';
import { RouteCanvasEditor } from '@/features/admin/ui/route-canvas/RouteCanvasEditor';
import {
  isValidRequestTypeCode,
  REQUEST_TYPE_CODE_HINT,
  sanitizeRequestTypeCodeInput,
  slugifyRequestTypeCode,
} from '@/shared/lib/request-type-code';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

type DesignerStep = 'basics' | 'fields' | 'route';

const STEPS: { id: DesignerStep; label: string; icon: typeof Settings2 }[] = [
  { id: 'basics', label: 'Основное', icon: Settings2 },
  { id: 'fields', label: 'Поля формы', icon: FileText },
  { id: 'route', label: 'Маршрут', icon: GitBranch },
];

export interface RequestTypeDesignerState {
  code: string;
  name: string;
  description: string;
  fieldSchema: FieldSchemaItem[];
  defaultRouteTemplateId: string;
  allowedManualRoutes: string[];
  allowsPersonalRoute: boolean;
  maxPersonalRouteSteps: number;
  isActive: boolean;
}

interface RequestTypeDesignerProps {
  title: string;
  initial: RequestTypeDesignerState;
  routeTemplates: AdminRouteTemplate[];
  onCancel: () => void;
  onSubmit: (payload: CreateAdminRequestTypeInput) => void;
  isPending: boolean;
  submitError?: string | null;
}

export function RequestTypeDesigner({
  title,
  initial,
  routeTemplates,
  onCancel,
  onSubmit,
  isPending,
  submitError = null,
}: RequestTypeDesignerProps) {
  const [step, setStep] = useState<DesignerStep>('basics');
  const [form, setForm] = useState(initial);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(() => Boolean(initial.code));

  const { user } = useAuth();

  const publishedRoutes = useMemo(() => {
    const seen = new Set<string>();
    return routeTemplates
      .filter((route) => route.isPublished)
      .filter((route) => {
        if (seen.has(route.id)) return false;
        seen.add(route.id);
        return true;
      });
  }, [routeTemplates]);

  const selectedRoute = publishedRoutes.find(
    (route) => route.id === form.defaultRouteTemplateId,
  );

  const displayError = error ?? submitError;

  const updateName = (name: string) => {
    setForm((prev) => {
      const next = { ...prev, name };
      if (!codeTouched) {
        next.code = slugifyRequestTypeCode(name);
      }
      return next;
    });
  };

  const updateCode = (raw: string) => {
    setCodeTouched(true);
    setForm((prev) => ({ ...prev, code: sanitizeRequestTypeCodeInput(raw) }));
  };

  const handleSubmit = () => {
    setError(null);

    if (!form.name.trim()) {
      setError('Укажите название на шаге «Основное»');
      setStep('basics');
      return;
    }

    const code = (form.code.trim() || slugifyRequestTypeCode(form.name)).toLowerCase();
    if (!isValidRequestTypeCode(code)) {
      setError(
        'Не удалось получить код из названия. Введите код латиницей, например: contract_approval',
      );
      setStep('basics');
      return;
    }

    const schemaError = validateFieldSchemaEditor(form.fieldSchema);
    if (schemaError) {
      setError(schemaError);
      setStep('fields');
      return;
    }

    if (!form.defaultRouteTemplateId && !form.allowsPersonalRoute) {
      setError(
        publishedRoutes.length === 0
          ? 'Нет опубликованных маршрутов — включите персональный маршрут или сначала опубликуйте шаблон в «Маршруты»'
          : 'Выберите маршрут по умолчанию или включите персональный маршрут',
      );
      setStep('route');
      return;
    }

    onSubmit({
      code,
      name: form.name.trim(),
      description: form.description.trim() || null,
      fieldSchema: form.fieldSchema,
      defaultRouteTemplateId: form.defaultRouteTemplateId || null,
      allowedManualRoutes: form.allowedManualRoutes,
      allowsPersonalRoute: form.allowsPersonalRoute,
      maxPersonalRouteSteps: form.maxPersonalRouteSteps,
      isActive: form.isActive,
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-0 p-0">
        <div className="border-b border-border px-5 py-4">
          <CardTitle className="text-lg">{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Настройка в три шага — без технических деталей на одном экране.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {STEPS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setStep(id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  step === id
                    ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {displayError ? (
          <div className="px-5 pt-4">
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div
          className={cn(
            'grid gap-0',
            step === 'route' ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_320px]',
          )}
        >
          <div className="space-y-5 p-5">
            {step === 'basics' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="type-name">Название</Label>
                    <Input
                      id="type-name"
                      value={form.name}
                      onChange={(event) => updateName(event.target.value)}
                      placeholder="Согласование договора"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type-code">Код</Label>
                    <Input
                      id="type-code"
                      value={form.code}
                      onChange={(event) => updateCode(event.target.value)}
                      placeholder="soglasovanie_dogovora"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">{REQUEST_TYPE_CODE_HINT}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type-description">Описание</Label>
                  <Input
                    id="type-description"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Для чего используется этот тип"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  Тип доступен для создания новых запросов
                </label>
              </>
            ) : null}

            {step === 'fields' ? (
              <FieldSchemaEditor
                variant="compact"
                value={form.fieldSchema}
                onChange={(fieldSchema) => setForm({ ...form, fieldSchema })}
              />
            ) : null}

            {step === 'route' ? (
              <>
                <Alert>
                  <AlertDescription>
                    Нужен хотя бы один способ маршрутизации: шаблон по умолчанию или персональный
                    маршрут.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Маршрут по умолчанию</Label>
                    <Select
                      value={form.defaultRouteTemplateId || '__none__'}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          defaultRouteTemplateId: value === '__none__' ? '' : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Не выбран" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Не выбран</SelectItem>
                        {publishedRoutes.map((route) => (
                          <SelectItem key={route.id} value={route.id}>
                            {route.name} (v{route.version})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Используется автоматически, если автор не выберет другой маршрут.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Допустимые шаблоны для выбора автором</Label>
                    <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/10 p-3">
                      {publishedRoutes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет опубликованных маршрутов</p>
                      ) : (
                        publishedRoutes.map((route) => {
                          const checked = form.allowedManualRoutes.includes(route.id);
                          return (
                            <label
                              key={route.id}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setForm({
                                    ...form,
                                    allowedManualRoutes: event.target.checked
                                      ? [...form.allowedManualRoutes, route.id]
                                      : form.allowedManualRoutes.filter((id) => id !== route.id),
                                  });
                                }}
                                className="h-4 w-4 rounded border-input"
                              />
                              {route.name} (v{route.version})
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-4">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowsPersonalRoute}
                      onChange={(event) =>
                        setForm({ ...form, allowsPersonalRoute: event.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span>
                      <span className="font-medium">Персональный маршрут</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        Автор сам собирает цепочку согласующих (личные запросы к руководителю и
                        т.п.)
                      </span>
                    </span>
                  </label>

                  {form.allowsPersonalRoute ? (
                    <div className="space-y-2 pl-6">
                      <Label htmlFor="max-personal-steps">Максимум шагов</Label>
                      <Input
                        id="max-personal-steps"
                        type="number"
                        min={1}
                        max={10}
                        value={form.maxPersonalRouteSteps}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            maxPersonalRouteSteps: Math.min(
                              10,
                              Math.max(1, Number(event.target.value) || 1),
                            ),
                          })
                        }
                        className="h-9 w-24"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Схема согласования</Label>
                  {selectedRoute ? (
                    <RouteCanvasEditor
                      steps={selectedRoute.steps}
                      selectedIndex={null}
                      onSelectStep={() => {}}
                      readOnly
                      className="h-[min(520px,60vh)] min-h-[360px]"
                    />
                  ) : (
                    <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/10">
                      <p className="text-sm text-muted-foreground">
                        Выберите маршрут по умолчанию, чтобы увидеть схему
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="button" onClick={handleSubmit} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Сохранить
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
                Отмена
              </Button>
            </div>
          </div>

          {step !== 'route' ? (
            <aside className="border-t border-border bg-muted/15 p-5 lg:border-l lg:border-t-0 dark:bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Как увидит сотрудник
              </div>

              <div className="mt-4 space-y-4 rounded-xl border border-border/70 bg-card p-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Название запроса</Label>
                  <Input
                    value={form.name ? `Пример: ${form.name}` : ''}
                    disabled
                    placeholder="Краткое название"
                  />
                </div>

                {form.fieldSchema.length > 0 ? (
                  <FieldSchemaForm
                    schema={form.fieldSchema}
                    values={previewValues}
                    onChange={setPreviewValues}
                    idPrefix="preview"
                    currentUser={user}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Дополнительных полей нет — только название.
                  </p>
                )}
              </div>

              {selectedRoute ? (
                <div className="mt-4 rounded-xl border border-border/70 bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Маршрут
                  </p>
                  <p className="mt-1 text-sm font-medium">{selectedRoute.name}</p>
                  <ol className="mt-2 space-y-1.5">
                    {selectedRoute.steps.map((routeStep, index) => (
                      <li
                        key={routeStep.order}
                        className="flex items-baseline gap-2 text-sm text-muted-foreground"
                      >
                        <span className="font-mono text-xs text-primary">{index + 1}.</span>
                        <span>{routeStep.name}</span>
                        {routeStep.slaHours ? (
                          <span className="text-xs">· {routeStep.slaHours}ч</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
