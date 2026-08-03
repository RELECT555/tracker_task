'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/features/auth/model/useAuth';
import { loginWithMicrosoft } from '@/features/auth/lib/microsoft-auth';
import { routes } from '@/shared/config/routes';
import { safeRedirectPath } from '@/shared/config/auth';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ShaderBackground } from '@/shared/ui/mesh-gradient';
import { WayoMark } from '@/shared/ui/wayo-mark';
import { ApiError } from '@/shared/api/client';
import { cn } from '@/shared/lib/utils';

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function LoginThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const idx = order.indexOf((theme as (typeof order)[number]) ?? 'system');
    setTheme(order[(idx + 1) % order.length]);
  };

  const themeLabel = !mounted
    ? 'Системная'
    : theme === 'dark'
      ? 'Тёмная'
      : theme === 'light'
        ? 'Светлая'
        : 'Системная';

  const ThemeIcon =
    !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Тема: ${themeLabel}`}
      title={themeLabel}
      className="absolute right-4 top-4 z-20 h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      <ThemeIcon className="h-4 w-4" />
    </Button>
  );
}

export function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get('redirect'), routes.inbox);
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  const busy = isLoggingIn || isMicrosoftLoading;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login({ email, password }, redirectTo);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось выполнить вход';
      setError(message);
    }
  }

  async function handleMicrosoftLogin() {
    setError(null);
    setIsMicrosoftLoading(true);
    try {
      await loginWithMicrosoft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти через Microsoft');
    } finally {
      setIsMicrosoftLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <ShaderBackground />
      <LoginThemeToggle />

      <div
        className={cn(
          'animate-in fade-in relative z-10 w-full max-w-[384px] duration-300',
          'rounded-xl border border-border bg-card',
          'shadow-sm dark:border-border dark:shadow-none',
        )}
      >
        <div className="px-7 pb-7 pt-8">
          <header className="mb-7">
            <div className="mb-5 flex items-center gap-2.5">
              <WayoMark framed className="h-8 w-8" title="Wayo" />
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                Wayo
              </span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Вход</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Запросы, маршруты и согласования
            </p>
          </header>

          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center gap-2.5 font-medium"
              disabled={busy}
              onClick={() => void handleMicrosoftLogin()}
            >
              <MicrosoftLogo className="h-4 w-4 shrink-0" />
              {isMicrosoftLoading ? 'Microsoft…' : 'Войти через Microsoft'}
            </Button>

            <div className="relative flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">или email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-10"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="mt-1 h-10 w-full" disabled={busy}>
                {isLoggingIn ? 'Вход…' : 'Войти'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
