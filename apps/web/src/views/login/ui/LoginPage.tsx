'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import { safeRedirectPath } from '@/shared/config/auth';
import { routes } from '@/shared/config/routes';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export function LoginPage() {
  const searchParams = useSearchParams();
  const { login, loginError, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('admin@tracker.local');
  const [password, setPassword] = useState('tracker');
  const redirectTo = safeRedirectPath(searchParams.get('redirect'), routes.roadmap);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login({ email, password }, redirectTo);
  }

  const errorMessage = loginError instanceof ApiError ? loginError.message : loginError ? 'Не удалось выполнить вход' : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Roadmap</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Вход в рабочее пространство</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Используйте корпоративную учётную запись, чтобы открыть план проекта.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="password">Пароль</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
          <Button type="submit" className="w-full" disabled={isLoggingIn}>{isLoggingIn ? 'Выполняется вход…' : 'Войти'}</Button>
        </form>
      </section>
    </main>
  );
}

