'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, GitBranch, LogOut, Users } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { WayoMark } from '@/shared/ui/wayo-mark';

const TOUR_STEPS = [
  {
    eyebrow: 'СТАРТОВАЯ ТОЧКА',
    title: 'Здесь начинается работа команды',
    description: 'Это общий вход в рабочие пространства. Выберите направление, которое нужно сейчас.',
    target: 'start',
  },
  {
    eyebrow: 'НАПРАВЛЕНИЕ 01',
    title: 'Wayo — командные запросы',
    description: 'Здесь живут запросы, согласования и эскалации команды.',
    target: 'wayo',
  },
  {
    eyebrow: 'НАПРАВЛЕНИЕ 02',
    title: 'Roadmap — план команды',
    description: 'Здесь планируют инициативы, сроки и загрузку команды.',
    target: 'roadmap',
  },
] as const;

export function WorkspacePickerPage() {
  const { logout } = useAuth();
  const [tourStep, setTourStep] = useState<number | null>(0);
  const step = tourStep === null ? null : TOUR_STEPS[tourStep];

  const nextStep = () => {
    if (tourStep === null) return;
    setTourStep(tourStep === TOUR_STEPS.length - 1 ? null : tourStep + 1);
  };

  return (
    <main className="flex min-h-screen flex-col bg-background px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
      <header className={`flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors sm:px-5 ${step?.target === 'start' ? 'border-primary/50 ring-4 ring-primary/10' : 'border-border'}`}>
        <div className="flex items-center gap-3">
          <WayoMark framed className="h-10 w-10 rounded-xl" title="Wayo" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-foreground">Wayo</p>
            <p className="mt-1 text-xs text-muted-foreground">Рабочие пространства</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LogOut className="h-4 w-4" strokeWidth={1.7} />Выйти
        </button>
      </header>

      <div className="mx-auto grid w-full max-w-[1480px] flex-1 content-center gap-8 py-10 xl:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.7fr)] xl:items-center xl:gap-14 xl:py-14">
        <aside className="order-2 xl:order-1">
          {step ? <section aria-live="polite" aria-label="Знакомство с рабочими пространствами" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Знакомство с Wayo</p>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">{tourStep! + 1} / {TOUR_STEPS.length}</span>
            </div>
            <div className="mt-5 flex gap-1.5" aria-hidden="true">{TOUR_STEPS.map((item, index) => <span key={item.eyebrow} className={`h-1 flex-1 rounded-full ${index <= tourStep! ? 'bg-primary' : 'bg-muted'}`} />)}</div>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{step.eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">{step.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setTourStep(null)} className="px-2 text-muted-foreground">Пропустить</Button>
              <div className="flex items-center gap-2">
                {tourStep! > 0 ? <Button type="button" variant="outline" size="icon" aria-label="Предыдущий шаг" onClick={() => setTourStep(tourStep! - 1)}><ArrowLeft className="h-4 w-4" /></Button> : null}
                <Button type="button" onClick={nextStep} className="gap-2">{tourStep === TOUR_STEPS.length - 1 ? 'Понятно' : 'Далее'}{tourStep === TOUR_STEPS.length - 1 ? null : <ArrowRight className="h-4 w-4" />}</Button>
              </div>
            </div>
          </section> : <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            <p className="text-sm font-medium text-foreground">Можно сразу перейти к работе</p>
            <p className="mt-1.5 text-sm text-muted-foreground">Если понадобится, короткое знакомство можно открыть снова.</p>
            <Button type="button" variant="outline" onClick={() => setTourStep(0)} className="mt-5">Показать тур</Button>
          </div>}
        </aside>

        <section className="order-1 min-w-0 xl:order-2" aria-labelledby="workspace-title">
          <div className="mb-7 sm:mb-9">
            <p className="text-sm font-medium text-primary">Рабочие пространства</p>
            <h1 id="workspace-title" className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-5xl">Куда перейдём?</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">Выберите пространство, чтобы продолжить работу команды.</p>
          </div>

          <nav aria-label="Рабочие пространства" className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <Link href={routes.home} className={`group flex min-h-[250px] flex-col rounded-2xl border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7 ${step?.target === 'wayo' ? 'border-primary/60 ring-4 ring-primary/10 shadow-md' : 'border-border hover:border-primary/35'}`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary"><WayoMark className="h-7 w-7" title="Wayo" /></span>
              <span className="mt-6 flex items-center justify-between gap-4"><span className="text-xl font-semibold tracking-tight text-foreground">Wayo</span><ArrowUpRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" /></span>
              <span className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Запросы, согласования и эскалации команды.</span>
              <span className="mt-auto flex items-center gap-2 pt-8 text-sm font-medium text-primary"><Users className="h-4 w-4" />Открыть Wayo</span>
            </Link>

            <Link href={routes.roadmap} className={`group flex min-h-[250px] flex-col rounded-2xl border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7 ${step?.target === 'roadmap' ? 'border-sky-500/60 ring-4 ring-sky-500/10 shadow-md' : 'border-border hover:border-sky-500/35'}`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-600/15 bg-sky-600/5 text-sky-700 dark:text-sky-300"><GitBranch className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="mt-6 flex items-center justify-between gap-4"><span className="text-xl font-semibold tracking-tight text-foreground">Roadmap</span><ArrowUpRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-sky-700 dark:group-hover:text-sky-300" /></span>
              <span className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Планирование инициатив и приоритетов команды.</span>
              <span className="mt-auto flex items-center gap-2 pt-8 text-sm font-medium text-sky-700 dark:text-sky-300"><GitBranch className="h-4 w-4" />Открыть Roadmap</span>
            </Link>
          </nav>
        </section>
      </div>
    </main>
  );
}
