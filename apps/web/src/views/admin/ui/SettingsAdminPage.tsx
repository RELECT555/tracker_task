'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminApi } from '@/entities/admin/api/adminApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { formatAdminApiError } from '@/shared/lib/admin-errors';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

export function SettingsAdminPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.admin.settings(),
    queryFn: () => adminApi.getSettings(),
  });

  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setEnabled(settingsQuery.data.slaAutoEscalationEnabled);
    }
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: (slaAutoEscalationEnabled: boolean) =>
      adminApi.updateSettings({ slaAutoEscalationEnabled }),
    onMutate: () => {
      setError(null);
      setSavedHint(false);
    },
    onSuccess: (data) => {
      setEnabled(data.slaAutoEscalationEnabled);
      void queryClient.setQueryData(queryKeys.admin.settings(), data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
      setSavedHint(true);
    },
    onError: (err) => {
      setError(formatAdminApiError(err));
      if (settingsQuery.data) {
        setEnabled(settingsQuery.data.slaAutoEscalationEnabled);
      }
    },
  });

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    mutation.mutate(next);
  };

  return (
    <DashboardShell
      title="Настройки"
      description="Глобальные параметры системы согласования"
    >
      <AdminNav />

      <section className="mt-6 max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground dark:text-foreground/70">
          Параметры, которые действуют для всех маршрутов и типов запросов.
        </p>

        {settingsQuery.isLoading ? <TableSkeleton rows={2} /> : null}

        {settingsQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {formatAdminApiError(settingsQuery.error)}
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {settingsQuery.data ? (
          <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] dark:ring-1 dark:ring-border/80">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Автоэскалация по SLA
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground dark:text-foreground/70">
                  Каждые 5 минут система передаёт просроченные шаги руководителю
                  текущего исполнителя. Срок шага задаётся в шаблоне маршрута
                  (поле SLA).
                </p>
                {savedHint ? (
                  <p className="mt-2 text-xs text-muted-foreground">Сохранено</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label="Автоэскалация по SLA"
                  disabled={mutation.isPending}
                  onClick={toggle}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    enabled ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out',
                      enabled && 'translate-x-5',
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </DashboardShell>
  );
}
