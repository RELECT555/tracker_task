'use client';

import Link from 'next/link';
import { ArrowUpRight, GitBranch, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { WayoMark } from '@/shared/ui/wayo-mark';

export function WorkspacePickerPage() {
  const { user, logout } = useAuth();
  const names = user?.fullName?.trim().split(/\s+/) ?? [];
  const lastName = names[1] ?? names[0];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-5 pb-12 pt-8 sm:px-8 sm:pt-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.08),transparent_68%)]"
      />
      <div className="relative mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WayoMark framed className="h-10 w-10 rounded-xl" title="Wayo" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-foreground">Wayo</p>
              <p className="mt-1 text-xs text-muted-foreground">Рабочие пространства</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.7} />
            Выйти
          </button>
        </header>

        <section className="mt-12 sm:mt-16">
          <p className="text-sm font-medium text-primary">
            {lastName ? `Рады видеть, ${lastName}` : 'Добро пожаловать'}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Куда перейдём?
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Выберите пространство, чтобы продолжить работу.
          </p>
        </section>

        <nav aria-label="Рабочие пространства" className="mt-9 grid gap-5 sm:grid-cols-2">
          <Link
            href={routes.home}
            className="group relative flex min-h-[244px] flex-col overflow-hidden rounded-[20px] border border-primary/20 bg-card/90 p-6 shadow-md shadow-primary/[0.035] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-primary/10 bg-primary/[0.08] text-primary">
                <WayoMark className="h-7 w-7" title="Wayo" />
              </span>
            </div>
            <div className="mt-7">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Wayo</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Запросы, согласования и эскалации команды.
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-2 pt-7 text-sm font-medium text-primary">
              Перейти в Wayo <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href={routes.roadmap}
            className="group relative flex min-h-[244px] flex-col overflow-hidden rounded-[20px] border border-border/90 bg-card/90 p-6 shadow-md shadow-foreground/[0.025] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-xl hover:shadow-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-border/70 bg-muted/70 text-foreground/75">
                <GitBranch className="h-5 w-5" strokeWidth={1.7} />
              </span>
            </div>
            <div className="mt-7">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Roadmap</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Планирование инициатив и приоритетов команды.
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-2 pt-7 text-sm font-medium text-foreground/80">
              Перейти в Roadmap <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
