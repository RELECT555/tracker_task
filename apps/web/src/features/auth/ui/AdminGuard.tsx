'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isAdminUser(user)) {
      setAllowed(true);
      return;
    }

    router.replace(routes.inbox);
  }, [isLoading, router, user]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Проверка прав доступа…
      </div>
    );
  }

  return children;
}
