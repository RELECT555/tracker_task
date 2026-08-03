'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  FileText,
  GitBranch,
  Inbox,
  ListChecks,
  Route,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { useTour } from '@/features/onboarding/model/TourProvider';
import { TOUR_STEPS } from '@/features/onboarding/model/tour-steps';
import { routes } from '@/shared/config/routes';
import { Button, buttonVariants } from '@/shared/ui/button';
import { SilkShader } from '@/shared/ui/silk-shader';
import { WayoMark } from '@/shared/ui/wayo-mark';
import {
  getCompletedSteps,
  markWelcomeSeen,
  setCompletedSteps,
} from '@/shared/lib/onboarding-storage';
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

type PlanStep = {
  id: string;
  icon: LucideIcon;
  title: string;
  text: string;
  href: string;
  cta: string;
};

const USER_PLAN: PlanStep[] = [
  {
    id: 'create-request',
    icon: FileText,
    title: 'Создайте первый запрос',
    text: 'Выберите тип — маршрут согласования подставится сам.',
    href: routes.newRequest,
    cta: 'Создать запрос',
  },
  {
    id: 'outbox',
    icon: ClipboardList,
    title: 'Следите за своими запросами',
    text: 'Исходящие показывают текущий шаг и срок по каждому запросу.',
    href: routes.outbox,
    cta: 'Открыть исходящие',
  },
  {
    id: 'inbox',
    icon: Inbox,
    title: 'Разберите входящие',
    text: 'Здесь появляются запросы, которые ждут вашего решения.',
    href: routes.inbox,
    cta: 'Открыть входящие',
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Проверьте уведомления',
    text: 'Чтобы не пропустить шаг, где ждут именно вас.',
    href: routes.notifications,
    cta: 'К уведомлениям',
  },
];

const ADMIN_PLAN: PlanStep[] = [
  {
    id: 'request-types',
    icon: ListChecks,
    title: 'Опишите типы запросов',
    text: 'Поля формы и правила заполнения — основа всего остального.',
    href: routes.admin.requestTypes,
    cta: 'К типам запросов',
  },
  {
    id: 'route-templates',
    icon: GitBranch,
    title: 'Соберите маршрут согласования',
    text: 'Шаги, ответственные и SLA — на визуальном холсте.',
    href: routes.admin.routeTemplates,
    cta: 'К маршрутам',
  },
  {
    id: 'users',
    icon: Users,
    title: 'Проверьте людей и подразделения',
    text: 'Роли и руководители определяют, кому уйдёт согласование.',
    href: routes.admin.users,
    cta: 'К пользователям',
  },
  {
    id: 'create-request',
    icon: FileText,
    title: 'Проведите пробный запрос',
    text: 'Лучший способ проверить маршрут — пройти его самому.',
    href: routes.newRequest,
    cta: 'Создать запрос',
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
  step,
  index,
  done,
  onToggle,
  onGo,
}: {
  step: PlanStep;
  index: number;
  done: boolean;
  onToggle: () => void;
  onGo: () => void;
}) {
  const Icon = step.icon;
  return (
    <li
      className={cn(
        'animate-element flex items-start gap-4 rounded-2xl border p-4 transition-colors',
        done
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/70 bg-card/50 hover:border-border',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Снять отметку: ${step.title}` : `Отметить: ${step.title}`}
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
          {step.title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.text}</p>
      </div>

      <Link
        href={step.href}
        onClick={onGo}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'shrink-0 gap-1.5 text-primary hover:bg-primary/10',
        )}
      >
        {step.cta}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </li>
  );
}

export function WelcomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { start: startTour } = useTour();
  const [stage, setStage] = useState<'intro' | 'plan'>('intro');
  const [completed, setCompleted] = useState<string[]>([]);

  const userId = user?.id ?? '';
  const isAdmin = isAdminUser(user);
  const plan = useMemo(() => (isAdmin ? ADMIN_PLAN : USER_PLAN), [isAdmin]);

  useEffect(() => {
    if (!userId) return;
    setCompleted(getCompletedSteps(userId));
    // Seen as soon as the screen opens — a reload should not trap the user here.
    markWelcomeSeen(userId);
  }, [userId]);

  const persist = (next: string[]) => {
    setCompleted(next);
    if (userId) {
      setCompletedSteps(userId, next);
    }
  };

  const toggleStep = (id: string) =>
    persist(completed.includes(id) ? completed.filter((it) => it !== id) : [...completed, id]);

  const completeStep = (id: string) => {
    if (!completed.includes(id)) {
      persist([...completed, id]);
    }
  };

  const doneCount = plan.filter((step) => completed.includes(step.id)).length;
  const progress = Math.round((doneCount / plan.length) * 100);
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
                  {isAdmin
                    ? 'Пройдите по пунктам — после них система готова принимать запросы.'
                    : 'Четыре шага, чтобы освоиться. Отмечайте сделанное — прогресс сохранится.'}
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
              {plan.map((step, index) => (
                <PlanRow
                  key={step.id}
                  step={step}
                  index={index}
                  done={completed.includes(step.id)}
                  onToggle={() => toggleStep(step.id)}
                  onGo={() => completeStep(step.id)}
                />
              ))}
            </ul>

            <div className="animate-element animate-delay-900 mt-8 flex flex-wrap items-center gap-3">
              <Button
                className="h-11 gap-2 rounded-xl px-6 font-medium shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.65)]"
                onClick={() => startTour()}
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                Пройти тур
                <span className="text-xs font-normal opacity-80">
                  {TOUR_STEPS.length} шага
                </span>
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
