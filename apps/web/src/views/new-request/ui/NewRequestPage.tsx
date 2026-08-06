'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageBreadcrumbs } from '@/shared/ui/page-breadcrumbs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FileText,
  Flag,
  Layers,
  ListChecks,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  PRIORITY_LABELS,
  REQUEST_PRIORITIES,
  type RequestPriority,
} from '@tracker/shared';
import { requestTypeApi } from '@/entities/request-type/api/requestTypeApi';
import { validateFieldSchema } from '@/entities/request-type/model/field-schema';
import { requestApi } from '@/entities/request/api/requestApi';
import { FieldSchemaForm } from '@/features/request-fields/ui/FieldSchemaForm';
import { useAuth } from '@/features/auth/model/useAuth';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from '@/shared/ui/card';
import { FormSkeleton } from '@/shared/ui/skeleton';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

const workflowSteps = [
  {
    icon: Layers,
    title: 'Выберите тип',
    description: 'От типа зависят поля и маршрут согласования.',
  },
  {
    icon: FileText,
    title: 'Заполните данные',
    description: 'Название и поля типа запроса.',
  },
  {
    icon: Sparkles,
    title: 'Сохраните черновик',
    description: 'Черновик можно отредактировать перед отправкой.',
  },
  {
    icon: Send,
    title: 'Отправьте на согласование',
    description: 'Когда всё готово — запустите маршрут одной кнопкой.',
  },
];

export function NewRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('normal');
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const typesQuery = useQuery({
    queryKey: queryKeys.requestTypes.all,
    queryFn: () => requestTypeApi.list(),
  });

  const selectedType = typesQuery.data?.data.find((type) => type.id === typeId);

  useEffect(() => {
    setFieldValues({});
  }, [typeId]);

  const createMutation = useMutation({
    mutationFn: requestApi.create,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.outbox() });
      router.push(routes.request(result.id));
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!typeId) {
      setError('Выберите тип запроса');
      return;
    }

    if (selectedType?.fieldSchema.length) {
      const validationError = validateFieldSchema(selectedType.fieldSchema, fieldValues);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    createMutation.mutate({
      typeId,
      title,
      fields: fieldValues,
      priority,
    });
  };

  return (
    <DashboardShell
      title="Новый запрос"
      description="Создайте черновик и отправьте на согласование"
    >
      <PageBreadcrumbs
        items={[
          { label: 'Исходящие', href: routes.outbox },
          { label: 'Новый запрос' },
        ]}
      />

      {typesQuery.isLoading ? (
        <div className="mt-6">
          <FormSkeleton />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:gap-8">
          <Card className="overflow-hidden">
            <div className="border-b border-border/60 bg-muted/30 px-6 py-5 dark:bg-muted/15">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <FileText className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <CardTitle className="text-base">Основные данные</CardTitle>
                  <CardDescription className="mt-1.5 leading-relaxed">
                    Выберите тип, укажите название и заполните поля. После создания запрос
                    сохранится как черновик.
                  </CardDescription>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6 pt-6">
                {typesQuery.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{(typesQuery.error as Error).message}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="typeId" className="flex items-center gap-2 text-foreground">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    Тип запроса
                  </Label>
                  <Select value={typeId} onValueChange={setTypeId}>
                    <SelectTrigger id="typeId" className="h-11 bg-field">
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {typesQuery.data?.data.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedType?.description ? (
                    <p className="text-xs text-muted-foreground">{selectedType.description}</p>
                  ) : null}
                  {selectedType?.allowsPersonalRoute ? (
                    <p className="text-xs text-primary">
                      После создания черновика вы сможете сами выбрать согласующих при отправке.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title" className="flex items-center gap-2 text-foreground">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Название
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={500}
                    placeholder="Краткое название запроса"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Например: «Согласование договора с поставщиком» или «Заявка на доступ к системе»
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority" className="flex items-center gap-2 text-foreground">
                    <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                    Приоритет
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(value) => setPriority(value as RequestPriority)}
                  >
                    <SelectTrigger id="priority" className="h-11 bg-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_PRIORITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIORITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedType && selectedType.fieldSchema.length > 0 ? (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4 dark:bg-muted/10">
                    <p className="text-sm font-medium">Поля типа «{selectedType.name}»</p>
                    <FieldSchemaForm
                      schema={selectedType.fieldSchema}
                      values={fieldValues}
                      onChange={setFieldValues}
                      idPrefix="create"
                      currentUser={user}
                    />
                  </div>
                ) : null}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>

              <CardFooter className="flex-col-reverse gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 dark:bg-muted/10 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="w-full sm:w-auto"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Создать черновик
                </Button>
              </CardFooter>
            </form>
          </Card>

          <aside className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold">Как это работает</h2>
              </div>
              <ol className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      {index < workflowSteps.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                      )}
                    </div>
                    <div className="pb-1 pt-0.5">
                      <p className="text-sm font-medium leading-none">{step.title}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="border-dashed border-primary/25 bg-primary/5 p-5 dark:bg-primary/10">
              <p className="text-sm font-medium text-foreground">Черновик — это безопасно</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Пока запрос в статусе черновика, его видите только вы. Отправка на согласование
                доступна на странице запроса.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </DashboardShell>
  );
}
