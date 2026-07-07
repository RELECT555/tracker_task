'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import type { RequestStatus } from '@tracker/shared';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

interface RequestDetail {
  id: string;
  title: string;
  status: RequestStatus;
  type: { id: string; name: string; code: string } | null;
  fields: Record<string, unknown>;
  author: { id: string; fullName: string };
  createdAt: string;
}

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.requests.detail(requestId),
    queryFn: () => requestApi.getById(requestId) as Promise<RequestDetail>,
  });

  return (
    <DashboardShell title={data?.title ?? 'Запрос'}>
      <Link href={routes.outbox} className="mb-4 inline-block text-sm text-primary hover:underline">
        ← Назад к исходящим
      </Link>
      {isLoading && <p className="text-muted-foreground">Загрузка...</p>}
      {error && (
        <p className="text-destructive">{(error as Error).message}</p>
      )}
      {data && (
        <div className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <RequestStatusBadge status={data.status} />
            {data.type && (
              <span className="text-sm text-muted-foreground">{data.type.name}</span>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Автор</h2>
            <p>{data.author.fullName}</p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Поля</h2>
            <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(data.fields, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequestDetailPage requestId={id} />;
}
