'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { ApiError } from '@/shared/api/client';

export function AuthGuard({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasToken, isAuthenticated, profileError, configError } = useAuth();

  useEffect(() => {
    if (hasToken === false) {
      const redirect = encodeURIComponent(`${pathname}${window.location.search}`);
      router.replace(`${routes.login}?redirect=${redirect}`);
    }
  }, [hasToken, pathname, router]);

  if (configError) {
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Не удалось подключиться к серверу. Обновите страницу.
      </div>
    );
  }

  if (!isAuthenticated) {
    // Каркас показываем, пока сессия проверяется; ошибку — по-прежнему текстом.
    if (fallback && !(hasToken && profileError)) return fallback;
    return (
      <div role="status" className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {hasToken && profileError
          ? profileError instanceof ApiError && profileError.code === 'USER_NOT_PROVISIONED'
            ? profileError.message
            : 'Не удалось проверить сессию. Обновите страницу и попробуйте снова.'
          : 'Проверка авторизации…'}
      </div>
    );
  }

  return children;
}
