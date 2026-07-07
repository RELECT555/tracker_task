import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function InboxPage() {
  return (
    <DashboardShell title="Входящие запросы">
      <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm dark:shadow-none">
        <p className="text-muted-foreground">
          Inbox будет подключён после реализации API запросов.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Этап 1: Auth → Request CRUD → Routing Engine
        </p>
      </div>
    </DashboardShell>
  );
}
