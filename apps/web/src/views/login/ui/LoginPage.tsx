'use client';

import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ApiError } from '@/shared/api/client';

export function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('admin@tracker.local');
  const [password, setPassword] = useState('tracker');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await login({ email, password });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось выполнить вход';
      setError(message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 dark:bg-background">
      <Card className="w-full max-w-md border-border/60 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-field">
            <LayoutDashboard className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <CardTitle className="text-xl">Request Tracker</CardTitle>
            <CardDescription>Войдите в систему трекинга запросов</CardDescription>
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
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Dev: admin / manager / director @tracker.local, пароль{' '}
            <code className="rounded bg-muted px-1 py-0.5">tracker</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
