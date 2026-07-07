'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import { requestTypeApi } from '@/entities/request-type/api/requestTypeApi';
import { requestApi } from '@/entities/request/api/requestApi';
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

const DatePicker = dynamic(
  () => import('@/shared/ui/date-picker').then((m) => m.DatePicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-10 animate-pulse rounded-md border border-input bg-field" />
    ),
  },
);

const workflowSteps = [
  {
    icon: Layers,
    title: 'Выберите тип',
    description: 'От типа зависят поля и маршрут согласования.',
  },
  {
    icon: FileText,
    title: 'Заполните основное',
    description: 'Название и дата помогут быстрее понять суть запроса.',
  },
  {
    icon: Sparkles,
    title: 'Сохраните черновик',
    description: 'Дополнительные поля можно заполнить на следующем шаге.',
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
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [error, setError] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: queryKeys.requestTypes.all,
    queryFn: () => requestTypeApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: requestApi.create,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.outbox() });
      router.push(routes.request(result.id));
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!typeId) {
      setError('Выберите тип запроса');
      return;
    }
    createMutation.mutate({ typeId, title });
  };

  return (
    <DashboardShell
      title="Новый запрос"
      description="Создайте черновик и отправьте на согласование"
    >
      <Link
        href={routes.outbox}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Назад к исходящим
      </Link>

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
                    Выберите тип и укажите краткое название. Поля типа можно заполнить после
                    создания черновика.
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate" className="flex items-center gap-2 text-foreground">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    Желаемая дата
                    <span className="text-xs font-normal text-muted-foreground">(необязательно)</span>
                  </Label>
                  <DatePicker
                    id="startDate"
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Выберите дату"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title" className="flex items-center gap-2 text-foreground">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Название
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={500}
                    placeholder="Краткое описание запроса"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Например: «Отпуск 10–24 июля» или «Закупка ноутбука для отдела»
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>

              <CardFooter className="justify-end gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 dark:bg-muted/10">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending} size="lg">
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
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
