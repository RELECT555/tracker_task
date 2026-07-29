'use client';

import { Bell } from 'lucide-react';
import { EmptyState } from '@/shared/ui/empty-state';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function NotificationsPage() {
  return (
    <DashboardShell
      title="Уведомления"
      description="Назначения, решения и события по вашим запросам"
    >
      <EmptyState
        icon={Bell}
        title="Уведомлений пока нет"
        description="Когда по запросам появятся назначения, SLA или решения, они отобразятся здесь."
      />
    </DashboardShell>
  );
}
