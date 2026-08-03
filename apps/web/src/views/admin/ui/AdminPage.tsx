import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Building2, ChevronRight, FileType, GitBranch, ScrollText, Settings, Users } from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

const sections = [
  {
    href: routes.admin.requestTypes,
    title: 'Типы запросов',
    description: 'Кастомные поля формы и маршрут по умолчанию для любого процесса',
    icon: FileType,
  },
  {
    href: routes.admin.routeTemplates,
    title: 'Шаблоны маршрутов',
    description: 'Гибкие цепочки согласования с разными шагами и SLA',
    icon: GitBranch,
  },
  {
    href: routes.admin.users,
    title: 'Пользователи',
    description: 'Учётные записи, роли и руководители',
    icon: Users,
  },
  {
    href: routes.admin.orgUnits,
    title: 'Подразделения',
    description: 'Оргструктура и руководители подразделений',
    icon: Building2,
  },
  {
    href: routes.admin.audit,
    title: 'Журнал аудита',
    description: 'Кто менял роли, типы запросов и маршруты',
    icon: ScrollText,
  },
  {
    href: routes.admin.settings,
    title: 'Настройки',
    description: 'Глобальные параметры SLA и автоэскалации',
    icon: Settings,
  },
];

export function AdminPage() {
  return (
    <DashboardShell
      title="Администрирование"
      titleAs="p"
      description="Настройка типов запросов, полей и маршрутов под ваши процессы"
    >
      <div className="space-y-6">
        <AdminNav />

        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Обзор</h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-foreground/70">
            Выберите раздел для настройки справочников, маршрутов согласования и организационной
            структуры.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <AdminSectionLink key={section.href} {...section} />
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function AdminSectionLink({
  href,
  title,
  description,
  icon: Icon,
  soon,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  soon?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex h-full items-start gap-4 rounded-xl border border-border bg-card p-5',
        'shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)]',
        'transition-[border-color,box-shadow,transform,background-color] hover:-translate-y-px hover:border-primary/45',
        'hover:shadow-[0_2px_4px_hsl(var(--foreground)/0.05),0_8px_20px_hsl(var(--foreground)/0.07)]',
        'dark:ring-1 dark:ring-border/80 dark:hover:border-primary/40 dark:hover:bg-accent/25',
        soon && 'border-dashed dark:border-border',
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary',
          'ring-1 ring-primary/10 dark:bg-primary/18 dark:ring-primary/25',
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold leading-snug">{title}</h2>
          {soon ? (
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              скоро
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground dark:text-foreground/72">
          {description}
        </p>
      </div>
      <ChevronRight
        className={cn(
          'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-all',
          'opacity-35 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100',
          soon && 'opacity-20 group-hover:opacity-60',
        )}
      />
    </Link>
  );
}
