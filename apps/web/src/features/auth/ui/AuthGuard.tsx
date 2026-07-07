'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAuthRequired } from '@/shared/config/auth';
import { routes } from '@/shared/config/routes';
import { getAccessToken } from '@/shared/lib/auth-storage';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(!isAuthRequired());

  useEffect(() => {
    if (!isAuthRequired()) {
      setAllowed(true);
      return;
    }

    if (getAccessToken()) {
      setAllowed(true);
      return;
    }

    const redirect = encodeURIComponent(pathname);
    router.replace(`${routes.login}?redirect=${redirect}`);
  }, [pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Проверка авторизации…
      </div>
    );
  }

  return children;
}
