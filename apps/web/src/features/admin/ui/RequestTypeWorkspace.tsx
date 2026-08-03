'use client';

import {
  AlertCircle,
  ArrowLeft,
  Eye,
  FileText,
  GitBranch,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdminRouteTemplate,
  CreateAdminRequestTypeInput,
} from '@/entities/admin/api/adminApi';
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

type WorkspaceSection = 'basics' | 'fields' | 'route';

const SECTIONS: {
  id: WorkspaceSection;
  label: string;
  icon: typeof Settings2;
}[] = [
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

interface Issue {
  section: WorkspaceSection;
  message: string;
}

interface RequestTypeWorkspaceProps {
  title: string;
  initial: RequestTypeDesignerState;
  routeTemplates: AdminRouteTemplate[];
  onCancel: () => void;
  onSubmit: (payload: CreateAdminRequestTypeInput) => void;
  isPending: boolean;
  submitError?: string | null;
}

function Section({ title, hint, children }: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function RequestTypeWorkspace({
  title,
  initial,
  routeTemplates,
  onCancel,
  onSubmit,
  isPending,
  submitError = null,
}: RequestTypeWorkspaceProps) {
  const [section, setSection] = useState<WorkspaceSection>('basics');
  const [form, setForm] = useState(initial);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [codeTouched, setCodeTouched] = useState(() => Boolean(initial.code));

  const nameInputRef = useRef<HTMLInputElement>(null);
  const baseline = useRef(JSON.stringify(initial));
  const isDirty = JSON.stringify(form) !== baseline.current;

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

  const effectiveCode = (form.code.trim() || slugifyRequestTypeCode(form.name)).toLowerCase();

  const issues = useMemo<Issue[]>(() => {
    const list: Issue[] = [];

    if (!form.name.trim()) {
      list.push({ section: 'basics', message: 'Укажите название типа' });
    } else if (!isValidRequestTypeCode(effectiveCode)) {
      list.push({
        section: 'basics',
        message: 'Введите код латиницей, например: contract_approval',
      });
    }

    const schemaError = validateFieldSchemaEditor(form.fieldSchema);
    if (schemaError) {
      list.push({ section: 'fields', message: schemaError });
    }

    if (!form.defaultRouteTemplateId && !form.allowsPersonalRoute) {
      list.push({
        section: 'route',
        message:
          publishedRoutes.length === 0
            ? 'Нет опубликованных маршрутов — включите персональный маршрут или опубликуйте шаблон в «Маршруты»'
            : 'Выберите маршрут по умолчанию или включите персональный маршрут',
      });
    }

    return list;
  }, [
    effectiveCode,
    form.allowsPersonalRoute,
    form.defaultRouteTemplateId,
    form.fieldSchema,
    form.name,
    publishedRoutes.length,
  ]);

  const invalidSections = useMemo(
    () => new Set(issues.map((issue) => issue.section)),
    [issues],
  );

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

  const handleSubmit = useCallback(() => {
    if (isPending) return;

    if (issues.length > 0) {
      setShowErrors(true);
      setSection(issues[0].section);
      if (issues[0].section === 'basics') nameInputRef.current?.focus();
      return;
    }

    setShowErrors(false);
    onSubmit({
      code: effectiveCode,
      name: form.name.trim(),
      description: form.description.trim() || null,
      fieldSchema: form.fieldSchema,
      defaultRouteTemplateId: form.defaultRouteTemplateId || null,
      allowedManualRoutes: form.allowedManualRoutes,
      allowsPersonalRoute: form.allowsPersonalRoute,
      maxPersonalRouteSteps: form.maxPersonalRouteSteps,
      isActive: form.isActive,
    });
  }, [effectiveCode, form, isPending, issues, onSubmit]);

  const handleCancel = () => {
    if (isDirty && !confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    onCancel();
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSubmit]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const bannerIssues = showErrors ? issues : [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
            <ArrowLeft className="h-4 w-4" />
            Типы запросов
          </Button>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <span
            className={cn(
              'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
              form.isActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {form.isActive ? 'Активен' : 'Выключен'}
          </span>
          {isDirty ? (
            <span className="text-xs text-muted-foreground">Есть несохранённые изменения</span>
          ) : null}

          <div className="ml-auto">
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-4 py-2.5 md:px-6">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const invalid = showErrors && invalidSections.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  section === id
                    ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40',
                  invalid && section !== id && 'border-destructive/50 text-destructive',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {invalid ? <AlertCircle className="h-3.5 w-3.5 text-destructive" /> : null}
              </button>
            );
          })}
        </div>

        {bannerIssues.length > 0 || submitError ? (
          <div className="border-t border-destructive/30 bg-destructive/8 px-4 py-2.5 md:px-6">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                {submitError ? <p>{submitError}</p> : null}
                {bannerIssues.map((issue, index) => (
                  <button
                    key={`${issue.section}-${index}`}
                    type="button"
                    className="block text-left underline-offset-2 hover:underline"
                    onClick={() => setSection(issue.section)}
                  >
                    {issue.message}
                  </button>
                ))}
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
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6 lg:p-8">
            {section === 'basics' ? (
              <>
                <Section title="Название и код" hint="Как тип называется для сотрудников и как он адресуется в системе.">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2 lg:col-span-2">
                      <Label htmlFor="type-name">Название</Label>
                      <Input
                        id="type-name"
                        ref={nameInputRef}
                        value={form.name}
                        onChange={(event) => updateName(event.target.value)}
                        placeholder="Согласование договора"
                        aria-invalid={(showErrors && !form.name.trim()) || undefined}
                        className={cn(
                          showErrors &&
                            !form.name.trim() &&
                            'border-destructive focus-visible:ring-destructive/40',
                        )}
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
                </Section>

                <Section title="Доступность">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                    />
                    <span>
                      <span className="font-medium">Доступен для новых запросов</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        Выключенный тип остаётся у существующих запросов, но исчезает из формы
                        создания.
                      </span>
                    </span>
                  </label>
                </Section>
              </>
            ) : null}

            {section === 'fields' ? (
              <Section
                title="Поля формы"
                hint="Что сотрудник заполняет помимо названия. Справа — живой предпросмотр."
              >
                <FieldSchemaEditor
                  variant="compact"
                  value={form.fieldSchema}
                  onChange={(fieldSchema) => setForm({ ...form, fieldSchema })}
                />
              </Section>
            ) : null}

            {section === 'route' ? (
              <>
                <Section
                  title="Маршрут по умолчанию"
                  hint="Применяется автоматически, если автор не выберет другой маршрут."
                >
                  <Select
                    value={form.defaultRouteTemplateId || '__none__'}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        defaultRouteTemplateId: value === '__none__' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger className="max-w-md">
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
                </Section>

                <Section
                  title="Маршруты на выбор автору"
                  hint="Автор сможет переключиться на любой из отмеченных шаблонов."
                >
                  {publishedRoutes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Нет опубликованных маршрутов
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {publishedRoutes.map((route) => {
                        const checked = form.allowedManualRoutes.includes(route.id);
                        return (
                          <label
                            key={route.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                              checked
                                ? 'border-primary/60 bg-primary/[0.06]'
                                : 'border-border bg-field text-muted-foreground hover:border-primary/35',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  allowedManualRoutes: event.target.checked
                                    ? [...form.allowedManualRoutes, route.id]
                                    : form.allowedManualRoutes.filter((id) => id !== route.id),
                                })
                              }
                              className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                            />
                            <span className="truncate">
                              {route.name} (v{route.version})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Section>

                <Section title="Персональный маршрут">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowsPersonalRoute}
                      onChange={(event) =>
                        setForm({ ...form, allowsPersonalRoute: event.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                    />
                    <span>
                      <span className="font-medium">Автор собирает цепочку сам</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        Для личных запросов к руководителю и подобных случаев.
                      </span>
                    </span>
                  </label>

                  {form.allowsPersonalRoute ? (
                    <div className="space-y-2 pl-7">
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
                </Section>

                <div className="space-y-2">
                  <Label>Схема согласования</Label>
                  {selectedRoute ? (
                    <RouteCanvasEditor
                      steps={selectedRoute.steps}
                      selectedIndex={null}
                      onSelectStep={() => {}}
                      readOnly
                      className="h-[min(560px,62vh)] min-h-[320px] overflow-hidden rounded-xl border border-border"
                    />
                  ) : (
                    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/10">
                      <p className="text-sm text-muted-foreground">
                        Выберите маршрут по умолчанию, чтобы увидеть схему
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {!previewOpen ? (
          <Button
            variant="outline"
            size="sm"
            className="absolute right-4 top-4 z-10"
            onClick={() => setPreviewOpen(true)}
          >
            <PanelRightOpen className="h-4 w-4" />
            Предпросмотр
          </Button>
        ) : (
          <aside
            className={cn(
              'z-10 flex flex-col border-border bg-card',
              'absolute inset-x-0 bottom-0 max-h-[55%] border-t',
              'xl:relative xl:inset-auto xl:max-h-none xl:w-[380px] xl:shrink-0 xl:border-l xl:border-t-0',
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Как увидит сотрудник
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
                aria-label="Свернуть предпросмотр"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
              <div className="space-y-4 rounded-xl border border-border/70 bg-background p-4">
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

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Маршрут
                </p>
                {selectedRoute ? (
                  <>
                    <p className="mt-1 text-sm font-medium">{selectedRoute.name}</p>
                    <ol className="mt-2 space-y-1.5">
                      {selectedRoute.steps.map((routeStep, index) => (
                        <li
                          key={routeStep.order}
                          className="flex items-baseline gap-2 text-sm text-muted-foreground"
                        >
                          <span className="font-mono text-xs text-primary">{index + 1}.</span>
                          <span className="min-w-0 truncate">{routeStep.name}</span>
                          {routeStep.slaHours ? (
                            <span className="shrink-0 text-xs">· {routeStep.slaHours}ч</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {form.allowsPersonalRoute
                      ? 'Автор собирает цепочку сам'
                      : 'Маршрут не выбран'}
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
