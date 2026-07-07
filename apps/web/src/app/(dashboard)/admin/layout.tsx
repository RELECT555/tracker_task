import { AdminGuard } from '@/features/auth/ui/AdminGuard';

export default function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminGuard>{children}</AdminGuard>;
}
