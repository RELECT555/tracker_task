'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { requestTypeApi } from '@/entities/request-type/api/requestTypeApi';
import { requestApi } from '@/entities/request/api/requestApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';
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
      {typesQuery.isLoading ? (
        <FormSkeleton />
      ) : (
        <Card className="mx-auto w-full max-w-xl">
          <CardHeader>
            <CardTitle>Данные запроса</CardTitle>
            <CardDescription>
              Выберите тип и укажите краткое название. Поля типа можно заполнить позже.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              {typesQuery.error && (
                <Alert variant="destructive">
                  <AlertDescription>{(typesQuery.error as Error).message}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="typeId">Тип запроса</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger id="typeId">
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
                <Label htmlFor="startDate">Желаемая дата</Label>
                <DatePicker
                  id="startDate"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Выберите дату"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Название</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={500}
                  placeholder="Краткое описание запроса"
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="gap-3">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Отмена
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Создать черновик
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </DashboardShell>
  );
}
