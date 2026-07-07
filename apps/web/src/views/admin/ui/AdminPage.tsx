import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function AdminPage() {
  return (
    <DashboardShell title="Администрирование">
      <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm dark:shadow-none">
        <p className="text-muted-foreground">
          Панели управления пользователями, маршрутами и типами запросов.
        </p>
      </div>
    </DashboardShell>
  );
}
