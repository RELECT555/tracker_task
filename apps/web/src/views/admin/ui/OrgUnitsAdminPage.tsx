'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight } from 'lucide-react';
import { adminApi, type AdminOrgUnit } from '@/entities/admin/api/adminApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

function OrgUnitTreeNode({
  unit,
  depth = 0,
}: {
  unit: AdminOrgUnit;
  depth?: number;
}) {
  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-b border-border/60 py-3',
          depth > 0 && 'ml-4 border-l border-border/40 pl-4',
        )}
        style={{ marginLeft: depth > 0 ? depth * 16 : 0 }}
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{unit.name}</span>
        {unit.head ? (
          <span className="text-xs text-muted-foreground">
            · руководитель: {unit.head.fullName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">· руководитель не назначен</span>
        )}
      </div>

      {unit.children && unit.children.length > 0 ? (
        <div className="border-l border-border/30 ml-6">
          {unit.children.map((child) => (
            <OrgUnitTreeNode key={child.id} unit={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OrgUnitsAdminPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.orgUnits(),
    queryFn: () => adminApi.listOrgUnits(),
  });

  return (
    <DashboardShell
      title="Подразделения"
      description="Организационная структура компании"
    >
      <AdminNav />

      {isLoading && (
        <div className="mt-6">
          <TableSkeleton rows={4} />
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && data.data.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={Building2}
            title="Подразделения не настроены"
            description="Создайте корневое подразделение через seed или API."
          />
        </div>
      )}

      {data && data.data.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card px-5 py-2 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)] dark:shadow-none">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
            {data.flat.length} подразделений в дереве
          </div>
          {data.data.map((unit) => (
            <OrgUnitTreeNode key={unit.id} unit={unit} />
          ))}
        </section>
      )}
    </DashboardShell>
  );
}
