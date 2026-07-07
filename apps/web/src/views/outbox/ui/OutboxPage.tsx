'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function OutboxPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.outbox(),
    queryFn: () => requestApi.getOutbox(),
  });

  return (
    <DashboardShell
      title="Исходящие запросы"
      description="Запросы, созданные вами"
    >
      {isLoading && <TableSkeleton rows={6} />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Send}
          title="Запросов пока нет"
          description="Создайте первый запрос — он появится здесь после сохранения черновика."
          action={
            <Link href={routes.newRequest}>
              <Button>
                <Plus className="h-4 w-4" />
                Создать запрос
              </Button>
            </Link>
          }
        />
      )}

      {data && data.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Название</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Тип</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Статус</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Создан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.data.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={routes.request(item.id)}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{item.type.name}</td>
                    <td className="px-5 py-4">
                      <RequestStatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString('ru-RU')}
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
