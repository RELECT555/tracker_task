'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Inbox, ListChecks, PlusCircle, Send } from 'lucide-react';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { SlaIndicator } from '@/entities/request/ui/SlaIndicator';
import { useAuth } from '@/features/auth/model/useAuth';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { AsciiDither } from '@/shared/ui/ascii-dither';
import { buttonVariants } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function HomePage() {
  const { user } = useAuth();

  const inboxQuery = useQuery({
    queryKey: queryKeys.requests.inbox('active', 'sla'),
    queryFn: () => requestApi.getInbox({ scope: 'active', sort: 'sla' }),
  });

  const outboxQuery = useQuery({
    queryKey: queryKeys.requests.outbox(),
    queryFn: () => requestApi.getOutbox(),
  });

  const inboxItems = inboxQuery.data?.data ?? [];
  const recentItems = inboxItems.slice(0, 5);

  const firstName = user?.fullName?.split(/\s+/)[0];

  return (
    <DashboardShell
      title={firstName ? `Здравствуйте, ${firstName}!` : 'Главная'}
      description="Краткая сводка по вашим запросам"
    >
      <div className="relative mb-6 h-40 overflow-hidden rounded-lg border border-border bg-[#0b0f1a] sm:h-48">
        <AsciiDither />
        <div className="relative flex h-full flex-col justify-end gap-1 p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
            Wayo · согласования
          </p>
          <p className="max-w-md text-lg font-medium text-white sm:text-xl">
            {firstName ? `С возвращением, ${firstName}` : 'С возвращением'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Входящие
            </CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            {inboxQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold">{inboxQuery.data?.meta.total ?? 0}</p>
            )}
            <Link
              href={routes.inbox}
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              Перейти во входящие
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Исходящие
            </CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            {outboxQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold">{outboxQuery.data?.meta.total ?? 0}</p>
            )}
            <Link
              href={routes.outbox}
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              Перейти в исходящие
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Новый запрос
            </CardTitle>
            <PlusCircle className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Создайте новый запрос на согласование
            </p>
            <Link href={routes.newRequest} className={buttonVariants({ size: 'sm' })}>
              Создать запрос
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Требуют вашего внимания
        </h2>

        {inboxQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {inboxQuery.data && recentItems.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title="Inbox пуст"
            description="Здесь появятся запросы, назначенные на вас."
          />
        )}

        {recentItems.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-border">
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={routes.request(item.id)}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40 dark:hover:bg-accent/25"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type.name} · {item.currentStep.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <RequestStatusBadge status={item.status} />
                    <SlaIndicator
                      dueAt={item.currentStep.dueAt}
                      assignedAt={item.currentStep.assignedAt}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {inboxItems.length > 5 && (
          <Link
            href={routes.inbox}
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Показать все ({inboxItems.length})
          </Link>
        )}
      </div>
    </DashboardShell>
  );
}
