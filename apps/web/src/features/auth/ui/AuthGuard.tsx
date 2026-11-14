'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasToken, isAuthenticated, profileError } = useAuth();

  useEffect(() => {
    if (hasToken === false) {
      const redirect = encodeURIComponent(`${pathname}${window.location.search}`);
      router.replace(`${routes.login}?redirect=${redirect}`);
    }
  }, [hasToken, pathname, router]);

  if (!isAuthenticated) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {hasToken && profileError ? 'Не удалось проверить сессию. Обновите страницу и попробуйте снова.' : 'Проверка авторизации…'}
      </div>
    );
  }

  return children;
}
