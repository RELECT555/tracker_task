import { Settings } from 'lucide-react';
import { EmptyState } from '@/shared/ui/empty-state';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

export function AdminPage() {
  return (
    <DashboardShell
      title="Администрирование"
      description="Пользователи, типы запросов и маршруты"
    >
      <EmptyState
        icon={Settings}
        title="Админ-панель в разработке"
        description="Здесь будут управление пользователями, типами запросов и шаблонами маршрутов."
      />
    </DashboardShell>
  );
}
