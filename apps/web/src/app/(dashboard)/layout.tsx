import { AuthGuard } from '@/features/auth/ui/AuthGuard';

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
