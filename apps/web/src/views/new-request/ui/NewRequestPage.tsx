'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { requestTypeApi } from '@/entities/request-type/api/requestTypeApi';
import { requestApi } from '@/entities/request/api/requestApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function NewRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: queryKeys.requestTypes.all,
    queryFn: () => requestTypeApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: requestApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.outbox() });
      router.push(routes.outbox);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate({ typeId, title });
  };

  return (
    <DashboardShell title="Новый запрос">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-lg space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm dark:shadow-none"
      >
        {typesQuery.error && (
          <p className="text-sm text-destructive">{(typesQuery.error as Error).message}</p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Тип запроса</label>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Выберите тип</option>
            {typesQuery.data?.data.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Название</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
            placeholder="Краткое описание запроса"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Сохранение...' : 'Создать черновик'}
        </button>
      </form>
    </DashboardShell>
  );
}
