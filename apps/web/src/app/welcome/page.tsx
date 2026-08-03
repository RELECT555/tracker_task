import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { WelcomePage } from '@/views/welcome/ui/WelcomePage';

export default function Page() {
  return (
    <AuthGuard>
      <WelcomePage />
    </AuthGuard>
  );
}
