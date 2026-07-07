'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function OutboxPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.outbox(),
    queryFn: () => requestApi.getOutbox(),
  });

  return (
    <DashboardShell title="Исходящие запросы">
      {isLoading && (
        <p className="text-muted-foreground">Загрузка...</p>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}
      {data && data.data.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm dark:shadow-none">
          <p className="text-muted-foreground">Запросов пока нет.</p>
          <Link
            href={routes.newRequest}
            className="mt-4 inline-block text-primary hover:underline"
          >
            Создать первый запрос
          </Link>
        </div>
      )}
      {data && data.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm dark:shadow-none">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Создан</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <Link
                      href={routes.request(item.id)}
                      className="font-medium hover:text-primary"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.type.name}</td>
                  <td className="px-4 py-3">
                    <RequestStatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
