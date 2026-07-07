'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Rocket } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  adminApi,
  type AdminRouteTemplate,
  type CreateAdminRouteTemplateInput,
} from '@/entities/admin/api/adminApi';
import {
  RouteTemplateCanvasDesigner,
} from '@/features/admin/ui/RouteTemplateCanvasDesigner';
import {
  createDefaultRouteSteps,
  type RouteStepFormValue,
} from '@/features/admin/ui/RouteStepEditor';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

function PublishBadge({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
        published
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      )}
    >
      {published ? 'Опубликован' : 'Черновик'}
    </span>
  );
}

function toForm(template: AdminRouteTemplate): {
  name: string;
  steps: RouteStepFormValue[];
} {
  return {
    name: template.name,
    steps: template.steps.map((step) => ({
      ...step,
      slaHours: step.slaHours ?? null,
    })),
  };
}

export function RouteTemplatesAdminPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingTemplate, setEditingTemplate] = useState<AdminRouteTemplate | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.routeTemplates(),
    queryFn: () => adminApi.listRouteTemplates(),
  });

  const templates = data?.data ?? [];

  const draftByTemplateId = useMemo(() => {
    const map = new Map<string, AdminRouteTemplate>();
    for (const template of templates) {
      if (!template.isPublished) {
        map.set(template.id, template);
      }
    }
    return map;
  }, [templates]);

  const latestVersionById = useMemo(() => {
    const map = new Map<string, number>();
    for (const template of templates) {
      const current = map.get(template.id) ?? 0;
      if (template.version > current) {
        map.set(template.id, template.version);
      }
    }
    return map;
  }, [templates]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.routeTemplates() });
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.requestTypes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.requestTypes.all });
  };

  const createMutation = useMutation({
    mutationFn: adminApi.createRouteTemplate,
    onSuccess: () => {
      setMutationError(null);
      setMode('list');
      invalidate();
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      version,
      input,
    }: {
      id: string;
      version: number;
      input: CreateAdminRouteTemplateInput;
    }) => adminApi.updateRouteTemplate(id, version, input),
    onSuccess: () => {
      setMutationError(null);
      setMode('list');
      setEditingTemplate(null);
      invalidate();
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const publishMutation = useMutation({
    mutationFn: adminApi.publishRouteTemplate,
    onSuccess: () => {
      setMutationError(null);
      invalidate();
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const newVersionMutation = useMutation({
    mutationFn: adminApi.createRouteTemplateVersion,
    onSuccess: () => {
      setMutationError(null);
      invalidate();
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const startEdit = (template: AdminRouteTemplate) => {
    setEditingTemplate(template);
    setMode('edit');
    setMutationError(null);
  };

  return (
    <DashboardShell
      title="Шаблоны маршрутов"
      description="Настройка цепочек согласования под любые процессы"
    >
      <AdminNav />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Черновик → публикация. Для изменений опубликованного маршрута создайте новую версию.
        </p>
        {mode === 'list' ? (
          <Button onClick={() => { setMode('create'); setMutationError(null); }}>
            <Plus className="h-4 w-4" />
            Новый маршрут
          </Button>
        ) : null}
      </div>

      {mutationError && mode === 'list' ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      ) : null}

      {mode === 'create' ? (
        <div className="mt-6">
          <RouteTemplateCanvasDesigner
            title="Новый маршрут"
            initialName=""
            initialSteps={createDefaultRouteSteps()}
            isPending={createMutation.isPending}
            onCancel={() => setMode('list')}
            onSubmit={(payload) => createMutation.mutate(payload)}
          />
        </div>
      ) : null}

      {mode === 'edit' && editingTemplate ? (
        <div className="mt-6">
          <RouteTemplateCanvasDesigner
            title={`Редактирование v${editingTemplate.version}`}
            initialName={toForm(editingTemplate).name}
            initialSteps={toForm(editingTemplate).steps}
            isPending={updateMutation.isPending}
            onCancel={() => {
              setMode('list');
              setEditingTemplate(null);
            }}
            onSubmit={(payload) =>
              updateMutation.mutate({
                id: editingTemplate.id,
                version: editingTemplate.version,
                input: payload,
              })
            }
          />
        </div>
      ) : null}

      {mode === 'list' && isLoading && (
        <div className="mt-6">
          <TableSkeleton rows={4} />
        </div>
      )}

      {mode === 'list' && error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {mode === 'list' && data && (
        <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)] dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted dark:bg-muted/25">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Название</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Версия</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Шаги</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Статус</th>
                  <th className="px-5 py-3.5 text-right font-medium text-muted-foreground"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((template) => {
                  const hasDraft = draftByTemplateId.has(template.id);
                  const isLatestVersion =
                    template.version === latestVersionById.get(template.id);
                  const canNewVersion =
                    template.isPublished && !hasDraft && isLatestVersion;

                  return (
                    <tr key={`${template.id}-${template.version}`} className="align-top hover:bg-muted/30">
                      <td className="px-5 py-4">
                        <p className="font-medium text-foreground">{template.name}</p>
                        {template.steps.length > 0 ? (
                          <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {template.steps.map((step) => (
                              <li key={step.order}>
                                {step.order + 1}. {step.name}
                                <span className="text-muted-foreground/70">
                                  {' '}
                                  · {step.assigneeType}
                                  {step.slaHours ? ` · ${step.slaHours}ч` : ''}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">v{template.version}</td>
                      <td className="px-5 py-4 text-muted-foreground">{template.stepCount}</td>
                      <td className="px-5 py-4">
                        <PublishBadge published={template.isPublished} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-end gap-1">
                          {!template.isPublished ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEdit(template)}
                              >
                                <Pencil className="h-4 w-4" />
                                Изменить
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={publishMutation.isPending}
                                onClick={() => publishMutation.mutate(template.id)}
                              >
                                <Rocket className="h-4 w-4" />
                                Опубликовать
                              </Button>
                            </>
                          ) : null}
                          {canNewVersion ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={newVersionMutation.isPending}
                              onClick={() => newVersionMutation.mutate(template.id)}
                            >
                              <Plus className="h-4 w-4" />
                              Новая версия
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
