'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { useTour } from '@/features/onboarding/model/TourProvider';
import { getPlan, type PlanItem } from '@/features/onboarding/model/onboarding-plan';
import { routes } from '@/shared/config/routes';
import { Button, buttonVariants } from '@/shared/ui/button';
import { SilkShader } from '@/shared/ui/silk-shader';
import { WayoMark } from '@/shared/ui/wayo-mark';
import { cn } from '@/shared/lib/utils';

type Perk = { icon: LucideIcon; title: string; text: string };

const PERKS: Perk[] = [
  {
    icon: Route,
    title: 'Маршрут вместо переписки',
    text: 'Запрос сам идёт по согласующим — ни писем, ни напоминаний вручную.',
  },
  {
    icon: Timer,
    title: 'Сроки на виду',
    text: 'У каждого шага свой SLA: видно, где стоит и кто держит.',
  },
  {
    icon: ShieldCheck,
    title: 'История решений',
    text: 'Кто, когда и почему согласовал — фиксируется автоматически.',
  },
];

function PerkCard({ item, delay }: { item: Perk; delay: string }) {
  const Icon = item.icon;
  return (
    <div
      className={cn(
        'animate-element rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-sm',
        delay,
      )}
    >
      <Icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
      <p className="mt-3 text-sm font-semibold tracking-tight text-foreground">{item.title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
    </div>
  );
}

function PlanRow({
  item,
  index,
  done,
  isNext,
  onToggle,
  onRunTour,
}: {
  item: PlanItem;
  index: number;
  done: boolean;
  isNext: boolean;
  onToggle: () => void;
  onRunTour: () => void;
}) {
  const Icon = item.icon;
  return (
    <li
      className={cn(
        'animate-element flex items-start gap-4 rounded-2xl border p-4 transition-colors',
        done && 'border-primary/30 bg-primary/5',
        !done && isNext && 'border-primary/40 bg-card/70 shadow-sm',
        !done && !isNext && 'border-border/70 bg-card/50 hover:border-border',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Снять отметку: ${item.title}` : `Отметить: ${item.title}`}
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          done
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground',
        )}
      >
        {done ? (
          <Check className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          <span className="text-xs font-medium tabular-nums">{index + 1}</span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'flex items-center gap-2 text-sm font-semibold tracking-tight',
            done ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
          {item.title}
          {isNext && !done ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
              следующий
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRunTour}
          className="gap-1.5 text-primary hover:bg-primary/10"
        >
          <Play className="h-3 w-3" strokeWidth={2} />
          Показать
        </Button>
        <Link
          href={item.href}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'gap-1.5 text-muted-foreground',
          )}
        >
          {item.cta}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    </li>
  );
}

export function WelcomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { completed, startTour, toggleCompleted } = useTour();
  const [stage, setStage] = useState<'intro' | 'plan'>(
    // Finishing a tour run comes back here — land straight on the plan.
    searchParams.get('stage') === 'plan' ? 'plan' : 'intro',
  );

  const isAdmin = isAdminUser(user);
  const plan = useMemo(() => getPlan(isAdmin), [isAdmin]);

  const doneCount = plan.filter((item) => completed.includes(item.id)).length;
  const progress = Math.round((doneCount / plan.length) * 100);
  const remaining = plan.filter((item) => !completed.includes(item.id));
  const nextItem = remaining[0] ?? null;
  const allDone = remaining.length === 0;

  // Russian full names come as "Фамилия Имя Отчество" — greet with the given name.
  const nameParts = user?.fullName?.trim().split(/\s+/) ?? [];
  const firstName = nameParts[1] ?? nameParts[0] ?? '';

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="absolute inset-0 z-0">
        <SilkShader />
        {/* Content sits in the middle, so the scrim opens up toward the edges */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[3px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--background)/0.92)_25%,transparent_75%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-14">
        <div className="animate-element animate-delay-100 mb-8 flex items-center gap-3">
          <WayoMark framed className="h-10 w-10 rounded-lg" title="Wayo" />
          <span className="text-lg font-semibold tracking-tight text-foreground">Wayo</span>
        </div>

        {stage === 'intro' ? (
          <>
            <h1 className="animate-element animate-delay-200 text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              {firstName ? `${firstName}, добро пожаловать` : 'Добро пожаловать'}
            </h1>
            <p className="animate-element animate-delay-300 mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Wayo ведёт запросы по маршруту согласования: от заявки до решения, со сроками
              и историей. Соберём короткий план — что сделать в первую очередь.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <PerkCard item={PERKS[0]} delay="animate-delay-400" />
              <PerkCard item={PERKS[1]} delay="animate-delay-500" />
              <PerkCard item={PERKS[2]} delay="animate-delay-600" />
            </div>

            <div className="animate-element animate-delay-700 mt-9 flex flex-wrap items-center gap-3">
              <Button
                className="h-11 gap-2 rounded-xl px-6 font-medium shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.65)]"
                onClick={() => setStage('plan')}
              >
                Составить план
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-xl text-muted-foreground"
                onClick={() => router.push(routes.inbox)}
              >
                Пропустить
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="animate-element animate-delay-100 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {isAdmin ? 'План настройки' : 'План первых шагов'}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  {allDone
                    ? 'План пройден — можно возвращаться к работе. Любой пункт можно показать заново.'
                    : 'Каждый пункт можно пройти с подсказками прямо в интерфейсе или открыть самому.'}
                </p>
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {doneCount} из {plan.length}
              </span>
            </div>

            <div
              className="animate-element animate-delay-200 mt-5 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Прогресс плана"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <ul className="mt-6 space-y-3">
              {plan.map((item, index) => (
                <PlanRow
                  key={item.id}
                  item={item}
                  index={index}
                  done={completed.includes(item.id)}
                  isNext={nextItem?.id === item.id}
                  onToggle={() => toggleCompleted(item.id)}
                  onRunTour={() => startTour([item.id])}
                />
              ))}
            </ul>

            <div className="animate-element animate-delay-900 mt-8 flex flex-wrap items-center gap-3">
              <Button
                className="h-11 gap-2 rounded-xl px-6 font-medium shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.65)]"
                onClick={() =>
                  startTour(
                    allDone ? plan.map((item) => item.id) : remaining.map((item) => item.id),
                  )
                }
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                {allDone
                  ? 'Пройти план заново'
                  : doneCount > 0
                    ? 'Продолжить план'
                    : 'Пройти весь план'}
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-xl"
                onClick={() => router.push(routes.inbox)}
              >
                Разберусь сам
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-xl text-muted-foreground"
                onClick={() => setStage('intro')}
              >
                Назад
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
