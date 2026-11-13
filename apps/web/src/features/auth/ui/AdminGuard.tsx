'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { hasAccessToken } from '@/shared/lib/auth-storage';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const allowed = isAdminUser(user);

  useEffect(() => {
    if (!isLoading && !allowed && hasAccessToken()) {
      router.replace(routes.roadmap);
    }
  }, [allowed, isLoading, router]);

  if (!allowed) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Проверка прав доступа…
      </div>
    );
  }

  return children;
}
