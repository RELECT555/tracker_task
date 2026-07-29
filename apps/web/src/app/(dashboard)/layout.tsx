import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { DashboardFrame } from '@/widgets/dashboard-shell/DashboardFrame';

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardFrame>{children}</DashboardFrame>
    </AuthGuard>
  );
}
