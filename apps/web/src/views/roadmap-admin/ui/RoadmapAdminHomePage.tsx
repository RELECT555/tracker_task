'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Cable, FolderKanban, Users, UserRoundCog } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';

const sections = [
  { href: routes.roadmapAdmin, title: 'Интеграции', description: 'Подключение Azure DevOps и управление источниками данных.', icon: Cable, action: 'Настроить подключение', tone: 'violet' },
  { href: routes.roadmapAdminUsers, title: 'Пользователи', description: 'Синхронизация участников и управление доступностью в планировании.', icon: Users, action: 'Управлять участниками', tone: 'blue' },
  { href: routes.roadmapAdminRoles, title: 'Роли', description: 'Общий каталог ролей и состав команды по каждому проекту.', icon: UserRoundCog, action: 'Настроить роли', tone: 'teal' },
];

const toneClasses = {
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300 group-hover:bg-violet-500/15',
  blue: 'bg-sky-500/10 text-sky-600 dark:text-sky-300 group-hover:bg-sky-500/15',
  teal: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 group-hover:bg-emerald-500/15',
};

export function RoadmapAdminHomePage() {
  const settingsQuery = useQuery({ queryKey: ['roadmap', 'integration', 'azure-devops'], queryFn: roadmapApi.integrationSettings });
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const roleCatalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog });
  const connected = settingsQuery.data?.configured ?? false;
  const projectCount = projectsQuery.data?.data.filter((project) => project.imported).length ?? 0;
  const activePeopleCount = peopleQuery.data?.filter((person) => person.isActive).length;
  const roleCount = roleCatalogQuery.data?.length;

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-14 -top-24 h-64 w-64 rounded-full bg-primary/[0.08] blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10"><FolderKanban className="h-3.5 w-3.5" /></span>Roadmap · Администрирование</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Центр управления</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">Подключение Azure DevOps, участники команды и роли проекта — всё в одном месте.</p>
            </div>
            <Link href={routes.roadmap} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"><span className="h-2 w-2 rounded-full bg-primary" />Открыть план<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        <section className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-4 sm:px-5 ${connected ? 'border-emerald-500/20 bg-emerald-500/[0.045]' : 'border-amber-500/25 bg-amber-500/[0.045]'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${connected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'}`}>{connected ? <BadgeCheck className="h-5 w-5" /> : <Cable className="h-5 w-5" />}</span>
            <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{settingsQuery.isLoading ? 'Проверяем подключение…' : connected ? 'Azure DevOps подключён' : 'Azure DevOps не подключён'}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{connected ? settingsQuery.data?.organizationUrl : 'Подключите организацию, чтобы синхронизировать проекты и пользователей.'}</p></div>
          </div>
          <Link href={routes.roadmapAdmin} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">{connected ? 'Настройки интеграции' : 'Подключить Azure DevOps'}<ArrowRight className="h-4 w-4" /></Link>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Проекты в Roadmap</span><FolderKanban className="h-4 w-4 text-muted-foreground/70" /></div><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{projectsQuery.isLoading ? '—' : projectCount}</p><p className="mt-1 text-xs text-muted-foreground">Импортированные проекты</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Активные участники</span><Users className="h-4 w-4 text-muted-foreground/70" /></div><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{activePeopleCount ?? '—'}</p><p className="mt-1 text-xs text-muted-foreground">Доступны для назначения в роли</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Роли в каталоге</span><UserRoundCog className="h-4 w-4 text-muted-foreground/70" /></div><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{roleCount ?? '—'}</p><p className="mt-1 text-xs text-muted-foreground">Можно добавлять в проекты</p></div>
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight text-foreground">Разделы администрирования</h2><p className="mt-1 text-sm text-muted-foreground">Выберите, что нужно настроить.</p></div><span className="hidden text-xs text-muted-foreground sm:inline">3 раздела</span></div>
          <div className="grid gap-3 lg:grid-cols-3">
            {sections.map(({ href, title, description, icon: Icon, action, tone }, index) => (
              <Link key={href} href={href} className="group relative flex min-h-52 flex-col overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/[0.04] sm:p-6">
                <div className="flex items-start justify-between gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${toneClasses[tone as keyof typeof toneClasses]}`}><Icon className="h-5 w-5" /></span><span className="rounded-md bg-muted/70 px-2 py-1 text-[10px] font-semibold tabular-nums text-muted-foreground">0{index + 1}</span></div>
                <div className="mt-5 flex-1"><h3 className="text-base font-semibold text-foreground">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
                <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3.5"><span className="text-sm font-medium text-primary">{action}</span><ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" /></div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
