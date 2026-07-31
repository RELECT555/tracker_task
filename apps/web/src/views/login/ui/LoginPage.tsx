'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/features/auth/model/useAuth';
import { DEV_ACCOUNTS, DEV_PASSWORD } from '@/features/auth/lib/dev-accounts';
import { routes } from '@/shared/config/routes';
import { safeRedirectPath } from '@/shared/config/auth';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ApiError } from '@/shared/api/client';

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
      variant="outline"
      size="sm"
      onClick={cycleTheme}
      aria-label="Переключить тему"
      className="absolute right-4 top-4"
    >
      <ThemeIcon className="h-4 w-4" />
      <span className="hidden sm:inline">{themeLabel}</span>
    </Button>
  );
}

export function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get('redirect'), routes.inbox);
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('employee@tracker.local');
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [error, setError] = useState<string | null>(null);

  async function signIn(nextEmail: string, nextPassword: string) {
    setError(null);
    try {
      await login({ email: nextEmail, password: nextPassword }, redirectTo);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось выполнить вход';
      setError(message);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await signIn(email, password);
  }

  async function handleDevAccount(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(DEV_PASSWORD);
    await signIn(accountEmail, DEV_PASSWORD);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <LoginThemeToggle />
      <Card className="w-full max-w-md border-border/60 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-field">
            <LayoutDashboard className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <CardTitle className="text-xl">Wayo</CardTitle>
            <CardDescription>Войдите, чтобы работать с запросами и маршрутами</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isLoggingIn}>
              {isLoggingIn ? 'Вход…' : 'Войти'}
            </Button>
          </form>

          <div className="mt-6 space-y-3 border-t border-border/60 pt-4">
            <p className="text-center text-xs text-muted-foreground">
              Dev-аккаунты, пароль{' '}
              <code className="rounded bg-muted px-1 py-0.5">{DEV_PASSWORD}</code>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEV_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto flex-col items-start gap-0.5 px-2.5 py-2 text-left"
                  disabled={isLoggingIn}
                  onClick={() => void handleDevAccount(account.email)}
                >
                  <span className="text-xs font-medium">{account.label}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {account.hint}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
