'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function InboxPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.inbox(),
    queryFn: () => requestApi.getInbox(),
  });

  return (
    <DashboardShell
      title="Входящие запросы"
      description="Запросы, назначенные на вас"
    >
      {isLoading && <TableSkeleton rows={6} />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="Inbox пуст"
          description="Здесь появятся запросы, назначенные на вас после отправки черновиков на согласование."
        />
      )}

      {data && data.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Название</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Автор</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Шаг</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Статус</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.data.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <Link
                        href={routes.request(item.id)}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{item.type.name}</p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{item.author.fullName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{item.currentStep.name}</td>
                    <td className="px-5 py-4">
                      <RequestStatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {item.currentStep.dueAt
                        ? new Date(item.currentStep.dueAt).toLocaleString('ru-RU')
                        : '—'}
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
