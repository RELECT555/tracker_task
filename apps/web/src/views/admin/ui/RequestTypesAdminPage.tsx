'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  adminApi,
  type AdminRequestType,
  type CreateAdminRequestTypeInput,
} from '@/entities/admin/api/adminApi';
import {
  RequestTypeDesigner,
  type RequestTypeDesignerState,
} from '@/features/admin/ui/RequestTypeDesigner';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {active ? 'Активен' : 'Выключен'}
    </span>
  );
}

interface RequestTypeFormState extends RequestTypeDesignerState {}

function emptyForm(): RequestTypeFormState {
  return {
    code: '',
    name: '',
    description: '',
    fieldSchema: [],
    defaultRouteTemplateId: '',
    allowedManualRoutes: [],
    allowsPersonalRoute: false,
    maxPersonalRouteSteps: 5,
    isActive: true,
  };
}

function toForm(type: AdminRequestType): RequestTypeFormState {
  return {
    code: type.code,
    name: type.name,
    description: type.description ?? '',
    fieldSchema: type.fieldSchema ?? [],
    defaultRouteTemplateId: type.defaultRouteTemplateId ?? '',
    allowedManualRoutes: type.allowedManualRoutes ?? [],
    allowsPersonalRoute: type.allowsPersonalRoute ?? false,
    maxPersonalRouteSteps: type.maxPersonalRouteSteps ?? 5,
    isActive: type.isActive,
  };
}

export function RequestTypesAdminPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingType, setEditingType] = useState<AdminRequestType | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.requestTypes(),
    queryFn: () => adminApi.listRequestTypes(),
  });

  const routesQuery = useQuery({
    queryKey: queryKeys.admin.routeTemplates(),
    queryFn: () => adminApi.listRouteTemplates(),
  });

  const routeTemplates = routesQuery.data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.requestTypes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.requestTypes.all });
  };

  const createMutation = useMutation({
    mutationFn: adminApi.createRequestType,
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
      input,
    }: {
      id: string;
      input: CreateAdminRequestTypeInput;
    }) => adminApi.updateRequestType(id, input),
    onSuccess: () => {
      setMutationError(null);
      setMode('list');
      setEditingType(null);
      invalidate();
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const startEdit = (type: AdminRequestType) => {
    setEditingType(type);
    setMode('edit');
    setMutationError(null);
  };

  return (
    <DashboardShell
      title="Типы запросов"
      description="Настройте произвольные типы, поля формы и маршруты по умолчанию"
    >
      <AdminNav />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Любой бизнес-процесс — через свой тип с кастомными полями.
        </p>
        {mode === 'list' ? (
          <Button onClick={() => { setMode('create'); setMutationError(null); }}>
            <Plus className="h-4 w-4" />
            Новый тип
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
          <RequestTypeDesigner
            title="Новый тип запроса"
            initial={emptyForm()}
            routeTemplates={routeTemplates}
            isPending={createMutation.isPending}
            onCancel={() => setMode('list')}
            onSubmit={(payload) => createMutation.mutate(payload)}
          />
        </div>
      ) : null}

      {mode === 'edit' && editingType ? (
        <div className="mt-6">
          <RequestTypeDesigner
            title={`Редактирование: ${editingType.name}`}
            initial={toForm(editingType)}
            routeTemplates={routeTemplates}
            isPending={updateMutation.isPending}
            onCancel={() => {
              setMode('list');
              setEditingType(null);
            }}
            onSubmit={(payload) =>
              updateMutation.mutate({ id: editingType.id, input: payload })
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
        <Card className="mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 dark:bg-muted/25">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Название</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Код</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Поля</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Маршрут</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Статус</th>
                  <th className="px-5 py-3.5 text-right font-medium text-muted-foreground"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.data.map((type) => (
                  <tr key={type.id} className="hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{type.name}</p>
                      {type.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{type.description}</p>
                      ) : null}
                      {type.fieldCount > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {type.fieldSchema.map((field) => field.label).join(' · ')}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{type.code}</td>
                    <td className="px-5 py-4 text-muted-foreground">{type.fieldCount}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {type.defaultRouteTemplateName ?? '—'}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge active={type.isActive} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(type)}>
                        <Pencil className="h-4 w-4" />
                        Изменить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </DashboardShell>
  );
}
