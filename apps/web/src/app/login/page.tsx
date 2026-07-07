import { Suspense } from 'react';
import { LoginPage } from '@/views/login/ui/LoginPage';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
