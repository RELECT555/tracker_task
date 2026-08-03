'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { adminApi } from '@/entities/admin/api/adminApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

const ENTITY_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'user', label: 'Пользователи' },
  { value: 'request_type', label: 'Типы запросов' },
  { value: 'route_template', label: 'Маршруты' },
  { value: 'system_setting', label: 'Настройки' },
] as const;

const ACTION_LABELS: Record<string, string> = {
  'user.updated': 'Изменён пользователь',
  'request_type.created': 'Создан тип запроса',
  'request_type.updated': 'Изменён тип запроса',
  'route_template.created': 'Создан маршрут',
  'route_template.updated': 'Изменён маршрут',
  'route_template.published': 'Опубликован маршрут',
  'route_template.version_created': 'Новая версия маршрута',
  'settings.updated': 'Изменены настройки',
};

const ENTITY_LABELS: Record<string, string> = {
  user: 'Пользователь',
  request_type: 'Тип запроса',
  route_template: 'Маршрут',
  system_setting: 'Настройки',
};

const FIELD_LABELS: Record<string, string> = {
  slaAutoEscalationEnabled: 'Автоэскалация SLA',
  fullName: 'ФИО',
  isActive: 'Активен',
  orgUnitId: 'Подразделение',
  managerId: 'Руководитель',
  roleCodes: 'Роли',
  name: 'Название',
  code: 'Код',
  description: 'Описание',
  fields: 'Поля',
  steps: 'Шаги',
};

/** Synthetic UUID used when auditing key-value system settings. */
const SYSTEM_SETTINGS_ENTITY_ID = '00000000-0000-4000-8000-0000000000a1';

const PAGE_SIZE = 30;

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'вкл' : 'выкл';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.length > 0 ? value : '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map(formatAuditValue).join(', ');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isChangeDiff(value: unknown): value is { from: unknown; to: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'from' in value &&
    'to' in value
  );
}

function summarizePayload(payload: Record<string, unknown>): ReactNode {
  const changes = payload.changes;
  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    const entries = Object.entries(changes as Record<string, unknown>);
    if (entries.length === 0) return '—';

    return (
      <ul className="space-y-1">
        {entries.map(([key, diff]) => {
          const label = FIELD_LABELS[key] ?? key;
          if (!isChangeDiff(diff)) {
            return (
              <li key={key} className="text-muted-foreground">
                {label}
              </li>
            );
          }

          return (
            <li key={key} className="leading-snug">
              <span className="text-foreground">{label}</span>
              <span className="mx-1.5 text-muted-foreground/80">:</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatAuditValue(diff.from)}
              </span>
              <span className="mx-1 text-muted-foreground" aria-hidden>
                →
              </span>
              <span className="font-mono text-[11px] font-medium text-foreground">
                {formatAuditValue(diff.to)}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  const parts: string[] = [];
  if (typeof payload.name === 'string') parts.push(payload.name);
  if (typeof payload.code === 'string') parts.push(payload.code);
  if (typeof payload.version === 'number') parts.push(`v${payload.version}`);
  if (typeof payload.stepCount === 'number') parts.push(`${payload.stepCount} шаг.`);
  if (typeof payload.fieldCount === 'number') parts.push(`${payload.fieldCount} пол.`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function entitySecondaryLine(entityType: string, entityId: string): string | null {
  if (entityType === 'system_setting' || entityId === SYSTEM_SETTINGS_ENTITY_ID) {
    return null;
  }
  return entityId.slice(0, 8);
}

export function AuditAdminPage() {
  const [entityType, setEntityType] = useState<string>('all');
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: [...queryKeys.admin.auditLogs(entityType), page],
    queryFn: () =>
      adminApi.listAuditLogs({
        page,
        limit: PAGE_SIZE,
        entityType: entityType === 'all' ? undefined : entityType,
      }),
  });

  const totalPages = useMemo(() => {
    if (!auditQuery.data) return 1;
    return Math.max(1, Math.ceil(auditQuery.data.total / auditQuery.data.limit));
  }, [auditQuery.data]);

  return (
    <DashboardShell
      title="Журнал аудита"
      description="Кто менял пользователей, типы запросов и маршруты"
    >
      <AdminNav />

      <div className="mt-6 flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1 dark:bg-accent/40">
        {ENTITY_FILTERS.map((filter) => {
          const active = entityType === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => {
                setEntityType(filter.value);
                setPage(1);
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-card font-medium text-foreground shadow-sm dark:bg-primary/12 dark:text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {auditQuery.isLoading && (
        <div className="mt-6">
          <TableSkeleton rows={6} />
        </div>
      )}

      {auditQuery.error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{(auditQuery.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {auditQuery.data && auditQuery.data.data.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          Записей аудита пока нет. Они появятся после изменений в админке.
        </p>
      )}

      {auditQuery.data && auditQuery.data.data.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)] dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 dark:bg-muted/25">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Когда
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Кто
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Действие
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Объект
                  </th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
                    Детали
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditQuery.data.data.map((entry) => {
                  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
                  const entityLabel = ENTITY_LABELS[entry.entityType] ?? entry.entityType;
                  const entityIdHint = entitySecondaryLine(entry.entityType, entry.entityId);

                  return (
                    <tr key={entry.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-5 py-4 align-top font-mono text-xs tabular-nums text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-5 py-4 align-top">
                        {entry.actor ? (
                          <div>
                            <p className="font-medium leading-snug text-foreground">
                              {entry.actor.fullName}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {entry.actor.email}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Система</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="leading-snug text-foreground" title={entry.action}>
                          {actionLabel}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="leading-snug text-foreground">{entityLabel}</p>
                        {entityIdHint ? (
                          <p
                            className="mt-0.5 font-mono text-[11px] text-muted-foreground"
                            title={entry.entityId}
                          >
                            {entityIdHint}…
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-md px-5 py-4 align-top text-muted-foreground">
                        {summarizePayload(entry.payload)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Всего {auditQuery.data.total} · страница {page} из {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Назад
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </DashboardShell>
  );
}
