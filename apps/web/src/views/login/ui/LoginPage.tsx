'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarDays, Eye, EyeOff, GitBranch, Monitor, Moon, Sun, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/features/auth/model/useAuth';
import { loginWithMicrosoft } from '@/features/auth/lib/microsoft-auth';
import { routes } from '@/shared/config/routes';
import { safeRedirectPath } from '@/shared/config/auth';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SilkShader } from '@/shared/ui/silk-shader';
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

const HIGHLIGHTS = [
  { icon: GitBranch, text: 'Wayo · запросы' },
  { icon: CalendarDays, text: 'Roadmap' },
  { icon: Users, text: 'Загрузка команды' },
] as const;

/**
 * Quiet pitch laid directly on the shader — a card here reads as a sticker on
 * top of the artwork. Contrast comes from the scrim behind it, not a surface.
 */
function HeroCaption() {
  return (
    <div className="relative max-w-sm [text-shadow:0_1px_16px_rgb(0_0_0/0.45)]">
      {/* Local scrim — darkens only behind the text, the silk stays vivid */}
      <div
        aria-hidden
        className="absolute -inset-x-10 -inset-y-12 rounded-[50%] bg-black/30 blur-3xl"
      />
      <p className="animate-element animate-delay-800 relative text-2xl font-medium leading-snug tracking-tight text-white">
        Запросы в движении. Команда — с понятным планом.
      </p>
      <p className="animate-element animate-delay-900 relative mt-3 text-sm leading-relaxed text-white/75">
        Wayo помогает вести запросы и эскалации. В Roadmap вы планируете эпики и фичи из Azure DevOps, назначаете роли и распределяете часы команды.
      </p>
      <div className="animate-element animate-delay-1000 relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {HIGHLIGHTS.map(({ icon: Icon, text }) => (
          <span
            key={text}
            className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/60"
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LoginPage() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  // Undefined (not a default) so useAuth can send first-time users to the tour.
  const redirectTo = redirectParam
    ? safeRedirectPath(redirectParam, routes.inbox)
    : undefined;
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background md:flex-row">
      {/* One shader across the whole page — no seam between the columns */}
      <div aria-hidden className="absolute inset-0 z-0">
        <SilkShader />
        {/* Scrim: opaque under the form, transparent over the right half */}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] md:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background from-15% via-background/90 via-38% to-transparent to-72% md:block" />
      </div>

      <LoginThemeToggle />

      {/* Brand — anchored to the page corner, not stacked above the form */}
      <div className="animate-element animate-delay-100 absolute left-6 top-6 z-20 flex items-center gap-3 md:left-8 md:top-8">
        <WayoMark framed className="h-11 w-11 rounded-lg" title="Wayo" />
        <span className="text-xl font-semibold tracking-tight text-foreground">Wayo</span>
      </div>

      {/* Left column — form, sitting on the faded end of the shader */}
      <section className="relative z-10 flex flex-1 items-center justify-center px-4 py-24 md:px-8 md:py-12">
        <div
          className={cn(
            'animate-element animate-delay-200 relative z-10 w-full max-w-[420px]',
            'rounded-[20px] border border-white/40 bg-card/80 p-8 backdrop-blur-2xl md:p-9',
            'shadow-[0_1px_1px_rgb(0_0_0/0.04),0_28px_60px_-24px_rgb(30_27_75/0.35)]',
            'dark:border-white/10 dark:bg-card/60',
            'dark:shadow-[0_1px_1px_rgb(255_255_255/0.04),0_28px_70px_-24px_rgb(0_0_0/0.7)]',
          )}
        >
          {/* Glass edge — bright hairline along the top, fading to the sides */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/25"
          />

          <header className="mb-8">
            <h1 className="animate-element animate-delay-300 text-[26px] font-semibold leading-none tracking-tight text-foreground">
              Вход
            </h1>
            <p className="animate-element animate-delay-400 mt-2.5 text-sm text-muted-foreground">
              Запросы, маршруты и согласования
            </p>
          </header>

          <div className="space-y-5">
            <Button
              type="button"
              variant="outline"
              className={cn(
                'animate-element animate-delay-500 h-11 w-full justify-center gap-2.5 rounded-xl',
                'border-border/80 bg-card/60 font-medium backdrop-blur-sm',
                'transition-shadow hover:shadow-sm',
              )}
              disabled={busy}
              onClick={() => void handleMicrosoftLogin()}
            >
              <MicrosoftLogo className="h-4 w-4 shrink-0" />
              {isMicrosoftLoading ? 'Microsoft…' : 'Войти через Microsoft'}
            </Button>

            <div className="animate-element animate-delay-600 relative flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                или email
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="animate-element animate-delay-700 space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-11 rounded-xl bg-field/70 backdrop-blur-sm"
                />
              </div>
              <div className="animate-element animate-delay-800 space-y-1.5">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="h-11 rounded-xl bg-field/70 pr-11 backdrop-blur-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    className={cn(
                      'absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl',
                      'text-muted-foreground transition-colors hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    )}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                className={cn(
                  'animate-element animate-delay-900 mt-2 h-11 w-full rounded-xl font-medium',
                  'shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.65)]',
                  'transition-shadow hover:shadow-[0_10px_26px_-8px_hsl(var(--primary)/0.8)]',
                )}
                disabled={busy}
              >
                {isLoggingIn ? 'Вход…' : 'Войти'}
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Right column — caption floating over the exposed part of the shader */}
      {/* Right column — caption on the same midline as the form, not a corner */}
      <section className="relative z-10 hidden flex-1 items-center justify-center px-8 py-12 md:flex">
        <HeroCaption />
      </section>
    </div>
  );
}
