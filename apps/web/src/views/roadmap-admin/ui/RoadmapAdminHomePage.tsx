'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Cable, FolderKanban, Users, UserRoundCog } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { AdminPage, AdminPageHeader, StatusPill } from './AdminLayout';

export function RoadmapAdminHomePage() {
  const settingsQuery = useQuery({ queryKey: ['roadmap', 'integration', 'azure-devops'], queryFn: roadmapApi.integrationSettings });
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const roleCatalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog });
  const connected = settingsQuery.data?.configured ?? false;
  const projectCount = projectsQuery.data?.data.filter((project) => project.imported).length;
  const activePeopleCount = peopleQuery.data?.filter((person) => person.isActive).length;
  const roleCount = roleCatalogQuery.data?.length;

  const sections = [
    {
      href: routes.roadmapAdmin,
      title: 'Интеграции',
      description: 'Подключение Azure DevOps, запись плана и webhook для мгновенных обновлений.',
      icon: Cable,
      meta: <StatusPill active={connected} label={settingsQuery.isLoading ? 'Проверяем…' : connected ? 'Подключено' : 'Не подключено'} />,
    },
    {
      href: routes.roadmapAdminUsers,
      title: 'Пользователи',
      description: 'Синхронизация участников организации и их доступность для планирования.',
      icon: Users,
      meta: <Metric value={activePeopleCount} label="активных" />,
    },
    {
      href: routes.roadmapAdminRoles,
      title: 'Роли',
      description: 'Общий каталог ролей и состав команды по каждому проекту.',
      icon: UserRoundCog,
      meta: <Metric value={roleCount} label="в каталоге" />,
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        title="Администрирование"
        description="Источники данных, участники команды и роли проектов."
        actions={<Link href={routes.roadmap} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-field px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent dark:border-border/70">Открыть план<ArrowRight className="h-4 w-4" /></Link>}
      />

      {!settingsQuery.isLoading && !connected ? (
        <Link href={routes.roadmapAdmin} className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-5 py-4 transition-colors hover:bg-amber-500/10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300"><Cable className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Начните с подключения Azure DevOps</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Без него не получится импортировать проекты и синхронизировать участников.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">Подключить<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
        </Link>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {sections.map(({ href, title, description, icon: Icon, meta }) => (
          <Link key={href} href={href} className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] transition-colors hover:border-primary/40 dark:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
              {meta}
            </div>
            <h2 className="mt-4 font-semibold text-foreground">{title}</h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Открыть<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <Summary icon={FolderKanban} label="Проектов в Roadmap" value={projectCount} />
          <Summary icon={Users} label="Активных участников" value={activePeopleCount} />
          <Summary icon={UserRoundCog} label="Ролей в каталоге" value={roleCount} />
          {connected && settingsQuery.data?.organizationUrl ? <p className="ml-auto truncate text-xs text-muted-foreground">{settingsQuery.data.organizationUrl}</p> : null}
        </div>
      </section>
    </AdminPage>
  );
}

function Metric({ value, label }: { value: number | undefined; label: string }) {
  return <span className="text-xs text-muted-foreground"><span className="text-sm font-semibold tabular-nums text-foreground">{value ?? '—'}</span> {label}</span>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | undefined }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4" strokeWidth={1.7} />
      {label}
      <span className={cn('font-semibold tabular-nums', value === undefined ? 'text-muted-foreground' : 'text-foreground')}>{value ?? '—'}</span>
    </div>
  );
}
