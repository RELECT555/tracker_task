'use client';

import { useRouter, usePathname } from '@/shared/lib/router/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';

export function AuthGuard({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasToken, isAuthenticated, profileError, configError, logout } = useAuth();

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
    if (hasToken && profileError instanceof ApiError && profileError.code === 'USER_NOT_PROVISIONED') {
      return (
        <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-sm text-muted-foreground">
          <p>{profileError.message}</p>
          <Button type="button" variant="outline" onClick={logout}>
            Выйти и войти другой учётной записью
          </Button>
        </div>
      );
    }
    return (
      <div role="status" className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {hasToken && profileError ? 'Не удалось проверить сессию. Обновите страницу и попробуйте снова.' : 'Проверка авторизации…'}
      </div>
    );
  }

  return children;
}
