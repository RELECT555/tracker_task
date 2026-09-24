'use client';

import Link from 'next/link';
import { ArrowUpRight, GitBranch, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { WayoMark } from '@/shared/ui/wayo-mark';

export function WorkspacePickerPage() {
  const { logout } = useAuth();

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background px-5 py-6 sm:px-8 sm:py-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_12%,hsl(var(--primary)/0.11),transparent_34%),radial-gradient(ellipse_at_90%_82%,hsl(205_85%_60%/0.08),transparent_36%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(hsl(var(--foreground)/0.16)_0.7px,transparent_0.7px)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <header className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WayoMark framed className="h-10 w-10 rounded-xl shadow-sm" title="Wayo" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-foreground">Wayo</p>
            <p className="mt-1 text-xs text-muted-foreground">Рабочие пространства</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
          Выйти
        </button>
      </header>

      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <div className="flex flex-1 items-center py-14 sm:py-20">
          <div className="w-full">
            <section className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl">
                Два пространства.<br />
                <span className="text-primary">Одна команда.</span>
              </h1>
            </section>

        <div className="relative mx-auto mt-9 grid w-full items-start gap-5 sm:mt-11 xl:grid-cols-[minmax(190px,1fr)_minmax(0,4fr)_minmax(190px,1fr)] xl:gap-7">
          <div aria-hidden className="pointer-events-none absolute left-[8%] right-[8%] top-[14px] hidden h-px bg-gradient-to-r from-primary/50 via-border to-sky-500/50 xl:block" />

          <aside className="order-2 rounded-2xl border border-primary/10 bg-primary/[0.035] p-4 sm:p-5 xl:order-1 xl:border-0 xl:bg-transparent xl:p-0 xl:text-right">
            <div className="relative z-10 flex items-center gap-2 xl:justify-end">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/25 bg-background text-[10px] font-bold text-primary shadow-sm">01</span>
              <span className="rounded-full bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Вы здесь</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">Центр команды</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Общая точка входа в рабочие пространства.
            </p>
          </aside>

          <div className="order-1 xl:order-2">
            <div className="relative z-10 mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 shadow-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">02</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Выберите пространство</span>
            </div>
        <nav aria-label="Рабочие пространства" className="grid w-full gap-4 sm:grid-cols-2">
          <Link
            href={routes.home}
            className="group flex min-h-[190px] flex-col rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-card p-6 shadow-sm transition-all duration-200 hover:border-primary/45 hover:shadow-lg hover:shadow-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7"
          >
            <span className="flex items-start justify-between gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-background/70 text-primary">
                <WayoMark className="h-7 w-7" title="Wayo" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/15 bg-background/60 text-primary transition-all group-hover:border-primary/30 group-hover:bg-primary group-hover:text-primary-foreground">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </span>
            <span className="mt-5 block text-xl font-semibold tracking-tight text-foreground">Wayo</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              Запросы, согласования и эскалации команды.
            </span>
          </Link>

          <Link
            href={routes.roadmap}
            className="group flex min-h-[190px] flex-col rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.07] via-card to-card p-6 shadow-sm transition-all duration-200 hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-900/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7"
          >
            <span className="flex items-start justify-between gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-background/70 text-sky-700 dark:text-sky-300">
                <GitBranch className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-500/15 bg-background/60 text-sky-700 transition-all group-hover:border-sky-500/25 group-hover:bg-sky-600 group-hover:text-white dark:text-sky-300 dark:group-hover:bg-sky-500">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </span>
            <span className="mt-5 block text-xl font-semibold tracking-tight text-foreground">Roadmap</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              Планирование инициатив и приоритетов команды.
            </span>
          </Link>
        </nav>
          </div>

          <aside className="order-3 rounded-2xl border border-sky-500/10 bg-sky-500/[0.035] p-4 sm:p-5 xl:border-0 xl:bg-transparent xl:p-0">
            <div className="relative z-10 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-500/25 bg-background text-[10px] font-bold text-sky-700 shadow-sm dark:text-sky-300">03</span>
              <span className="rounded-full bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">Дальше</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">Рабочая область</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Откроются задачи, участники и инструменты выбранного пространства.
            </p>
          </aside>
        </div>
          </div>
        </div>
      </div>
    </main>
  );
}
