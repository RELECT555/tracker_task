import { AdminGuard } from '@/features/auth/ui/AdminGuard';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
