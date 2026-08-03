import { Suspense } from 'react';
import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { WelcomePage } from '@/views/welcome/ui/WelcomePage';

export default function Page() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        }
      >
        <WelcomePage />
      </Suspense>
    </AuthGuard>
  );
}
