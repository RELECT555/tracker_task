'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { getSessionId } from '@/shared/lib/auth';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const allowed = isAdminUser(user);

  useEffect(() => {
    if (!isLoading && !allowed && getSessionId() !== null) {
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
