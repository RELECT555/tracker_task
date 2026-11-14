'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Layers2, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { safeRedirectPath } from '@/shared/config/auth';
import { routes } from '@/shared/config/routes';
import { ApiError } from '@/shared/api/client';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SpecterOrb } from './SpecterOrb';

const fieldClassName =
  'h-12 rounded-lg border-white/10 bg-[#14151c] px-4 text-base text-slate-100 shadow-none autofill:inset-shadow-[0_0_0_100px_#14151c] autofill:[-webkit-text-fill-color:var(--color-slate-100)] focus-visible:border-violet-300/60 focus-visible:ring-violet-300/20 sm:text-sm dark:border-white/10';

export function LoginPage() {
  const searchParams = useSearchParams();
  const { login, loginError, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('admin@tracker.local');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const redirectTo = safeRedirectPath(searchParams.get('redirect'), routes.home);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login({ email, password }, redirectTo);
    } catch {
      // The mutation exposes the error below; do not leak a rejected event promise.
    }
  }

  const errorMessage = loginError instanceof ApiError ? loginError.message : loginError ? 'Не удалось выполнить вход' : null;

  return (
    <main className="grid min-h-svh bg-[#08090e] text-slate-100 selection:bg-violet-400/30 lg:grid-cols-[1.12fr_1fr]">
      <section aria-label="Roadmap — пространство для ваших проектов" className="relative flex min-w-0 flex-col overflow-hidden lg:min-h-svh">
        <header className="relative z-10 flex items-center gap-3 px-6 pt-6 sm:px-10 sm:pt-9 lg:px-12 lg:pt-11">
          <span className="flex size-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
            <Layers2 className="size-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.04em]">roadmap<span className="text-violet-300">.</span></span>
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 sm:block">От идеи к результату</span>
        </header>

        <div className="relative flex-1 lg:mt-3">
          <SpecterOrb />
        </div>

        <div className="relative z-10 hidden px-12 pb-10 pt-7 lg:block">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.19em] text-violet-300">
            Пространство возможностей
          </p>
          <h2 className="text-[clamp(2rem,3.2vw,3.5rem)] leading-[1.12] font-medium tracking-[-0.055em] text-balance">
            Большие идеи.<br /><span className="text-slate-400">Понятный план.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-slate-400">Объединяйте проекты, задачи и команду.<br />Двигайтесь к результату вместе.</p>
          <div className="mt-9 flex items-center gap-3 border-t border-white/[0.08] pt-5 font-mono text-[10px] tracking-[0.04em] text-slate-400">
            <span>Проекты</span><span aria-hidden="true">/</span><span>Команда</span><span aria-hidden="true">/</span><span>Прогресс</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="login-title" className="relative flex min-w-0 flex-col border-t border-white/[0.07] bg-[#0e0f16] px-6 py-10 sm:px-10 sm:py-12 lg:border-t-0 lg:border-l lg:px-12 lg:py-11">
        <div className="hidden items-center justify-end gap-2 font-mono text-[10px] tracking-[0.08em] text-slate-400 lg:flex">
          <span className="size-1 rounded-full bg-violet-300/70" aria-hidden="true" /> Ваше рабочее пространство
        </div>
        <div className="mx-auto w-full max-w-[360px] lg:my-auto lg:py-16">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.2em] text-violet-300">Добро пожаловать</p>
          <h1 id="login-title" className="text-[30px] leading-tight font-medium tracking-[-0.045em] sm:text-[34px]">Всё начинается здесь.</h1>
          <p id="login-description" className="mt-3 max-w-[320px] text-sm leading-6 text-slate-400">Войдите в аккаунт, чтобы продолжить<br className="hidden sm:block" /> работу над вашими проектами.</p>

          <form onSubmit={handleSubmit} aria-describedby="login-description" aria-busy={isLoggingIn} className="mt-9 space-y-5 scheme-dark">
            <div className="grid gap-2.5">
              <Label htmlFor="email" className="text-[13px] font-normal text-slate-300">Рабочая почта</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isLoggingIn}
                aria-describedby={errorMessage ? 'login-error' : undefined}
                className={fieldClassName}
              />
            </div>
            <div className="grid gap-2.5">
              <Label htmlFor="password" className="text-[13px] font-normal text-slate-300">Пароль</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={isLoggingIn}
                  aria-describedby={errorMessage ? 'login-error' : undefined}
                  className={cn(fieldClassName, 'pr-12')}
                />
                <button
                  type="button"
                  aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((value) => !value)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
                >
                  {passwordVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {errorMessage ? <p id="login-error" role="alert" className="rounded-lg border border-rose-300/15 bg-rose-300/5 px-3 py-2.5 text-sm leading-5 text-rose-300">{errorMessage}</p> : null}
            <Button type="submit" className="mt-2 h-12 w-full justify-between rounded-lg bg-violet-300 px-4 font-semibold text-[#161122] shadow-none transition-[background-color,transform] hover:bg-violet-200 focus-visible:ring-violet-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f16] motion-reduce:active:scale-100" disabled={isLoggingIn}>
              <span>{isLoggingIn ? 'Выполняется вход…' : 'Войти в пространство'}</span>
              {isLoggingIn ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
            </Button>
          </form>
        </div>
        <footer className="mt-12 text-center font-mono text-[10px] tracking-[0.06em] text-slate-400 lg:mt-0">Меньше хаоса. Больше движения вперёд.</footer>
      </section>
    </main>
  );
}

