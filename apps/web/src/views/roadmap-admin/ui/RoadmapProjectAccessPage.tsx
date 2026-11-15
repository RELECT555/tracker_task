'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, X } from 'lucide-react';
import { projectAccessApi, type ProjectAccessRole } from '@/entities/roadmap/api/projectAccessApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { roadmapApi, type RoadmapPerson } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { RoadmapPersonAvatar } from '@/entities/roadmap/ui/RoadmapPersonAvatar';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { Input } from '@/shared/ui/input';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { AdminPage, AdminPageHeader } from './AdminLayout';

type AccessValue = ProjectAccessRole | 'none';

const accessLabels: Record<AccessValue, string> = { none: 'Нет доступа', viewer: 'Просмотр', planner: 'Редактирование плана' };
const filters = [
  { value: 'all', label: 'Все' },
  { value: 'granted', label: 'С доступом' },
] as const;
type Filter = (typeof filters)[number]['value'];

const accessOptions = (Object.keys(accessLabels) as AccessValue[]).map((value) => ({ value, label: accessLabels[value] }));
const columns = '@min-[42rem]:grid-cols-[minmax(0,1fr)_14rem] @min-[42rem]:gap-x-6';
const normalize = (email: string) => email.trim().toLocaleLowerCase('en-US');

function AccessRow({ person, value, disabled, onChange }: {
  person: RoadmapPerson;
  value: AccessValue;
  disabled: boolean;
  onChange: (value: AccessValue) => void;
}) {
  const noEmail = !person.email;
  return (
    <li className={cn('grid grid-cols-1 items-start gap-x-2 gap-y-2.5 px-3 py-3 hover:bg-muted/20 sm:px-5 @min-[42rem]:items-center @min-[42rem]:py-3.5', columns)}>
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <RoadmapPersonAvatar person={person} />
        <div className="min-w-0 self-center">
          <p className="min-w-0 text-sm font-semibold wrap-anywhere">{person.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground wrap-anywhere">{person.email ?? 'Почта не указана — выдать доступ нельзя'}</p>
        </div>
      </div>
      <SearchableSelect
        ariaLabel={`Доступ для ${person.name}`}
        value={value}
        disabled={disabled || noEmail}
        searchable={false}
        onChange={(next) => onChange(next === 'planner' ? 'planner' : next === 'viewer' ? 'viewer' : 'none')}
        options={accessOptions}
        className={cn(value === 'none' && '[&_span]:text-muted-foreground')}
      />
    </li>
  );
}

function AccessListSkeleton() {
  return (
    <SkeletonStatus label="Загружаем участников">
      <ul className="divide-y divide-border/70">
        {['w-40', 'w-32', 'w-48', 'w-36', 'w-44'].map((width, index) => <li key={index} className={cn('grid gap-3 px-3 py-3 sm:px-5 @min-[42rem]:items-center', columns)}>
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full sm:size-10" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn('h-3.5 max-w-full', width)} />
              <Skeleton className="h-3 w-32 max-w-full opacity-60" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
        </li>)}
      </ul>
    </SkeletonStatus>
  );
}

function ProjectMembers({ projectId, projectName, projectsQuery }: {
  projectId: string;
  projectName: string;
  projectsQuery: { error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };
}) {
  const queryClient = useQueryClient();
  const searchInput = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const queryKey = ['roadmap', 'project-access', projectId];
  const grants = useQuery({ queryKey, queryFn: () => projectAccessApi.list(projectId) });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const save = useMutation({ mutationFn: (entry: { email: string; role: ProjectAccessRole }) => projectAccessApi.set(projectId, entry), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (email: string) => projectAccessApi.revoke(projectId, email), onSuccess: refresh });
  const busy = save.isPending || revoke.isPending;

  const granted = useMemo(() => new Map((grants.data ?? []).map((entry) => [normalize(entry.email), entry.role])), [grants.data]);
  const rows = useMemo<RoadmapPerson[]>(() => {
    const people = (peopleQuery.data ?? []).filter((person) => person.isActive !== false || (person.email && granted.has(normalize(person.email))));
    const known = new Set(people.map((person) => normalize(person.email ?? '')));
    // Выданный доступ не должен пропадать из списка, даже если человека нет в справочнике.
    const orphans = (grants.data ?? []).filter((entry) => !known.has(normalize(entry.email)))
      .map((entry): RoadmapPerson => ({ id: `email:${entry.email}`, name: entry.email, email: entry.email } as RoadmapPerson));
    return [...people, ...orphans];
  }, [peopleQuery.data, grants.data, granted]);

  const term = search.trim().toLocaleLowerCase('ru-RU');
  const visible = useMemo(() => rows.filter((person) => {
    const has = !!person.email && granted.has(normalize(person.email));
    return (filter === 'all' || has) && (!term || `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term));
  }), [rows, granted, filter, term]);

  function change(person: RoadmapPerson, next: AccessValue) {
    if (!person.email) return;
    save.reset();
    revoke.reset();
    if (next === 'none') revoke.mutate(person.email);
    else save.mutate({ email: person.email, role: next });
  }

  function clearSearch() {
    setSearch('');
    searchInput.current?.focus();
  }

  const loading = grants.isPending || peopleQuery.isPending;

  return (
    <>
      <QueryErrorNotice
        title={save.error || revoke.error ? 'Не удалось изменить доступ к проекту' : 'Не удалось загрузить данные доступа'}
        queries={[projectsQuery, grants, peopleQuery]}
        errors={[save.error, revoke.error]}
      />
      <section aria-label={`Доступ к проекту «${projectName}»`} className="@container rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] dark:shadow-none">
        <div className="flex flex-col items-start gap-3 border-b border-border p-3 sm:px-5 sm:py-4 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
          <div role="group" aria-label="Фильтр по доступу" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-muted/55 p-1">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  filter === option.value ? 'bg-card text-foreground shadow-sm dark:bg-accent' : 'text-muted-foreground hover:bg-card/55 hover:text-foreground',
                )}
              >
                {option.label}
                {!loading ? (
                  <span className={cn('min-w-5 rounded px-1 text-center text-[11px] leading-[1.4rem] tabular-nums', filter === option.value ? 'bg-status-progress-bg text-status-progress-fg' : 'text-muted-foreground')}>
                    {option.value === 'all' ? rows.length : granted.size}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="relative w-full @min-[40rem]:max-w-72">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInput}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени или почте"
              aria-label="Найти пользователя"
              className={cn('rounded-lg pl-9 shadow-none [&::-webkit-search-cancel-button]:hidden', search && 'pr-11')}
            />
            {search ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Очистить поиск" onClick={clearSearch} className="absolute top-1 right-1 size-8 text-muted-foreground">
                <X aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div aria-busy={busy || grants.isFetching}>
          {loading ? (
            <AccessListSkeleton />
          ) : visible.length ? (
            <>
              <div aria-hidden="true" className={cn('hidden border-b border-border bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground @min-[42rem]:grid', columns)}>
                <span>Участник</span>
                <span>Доступ</span>
              </div>
              <ul className="divide-y divide-border/70">
                {visible.map((person) => (
                  <AccessRow
                    key={person.id}
                    person={person}
                    value={(person.email && granted.get(normalize(person.email))) || 'none'}
                    disabled={busy}
                    onChange={(next) => change(person, next)}
                  />
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <div className="mb-3 rounded-xl bg-status-progress-bg p-3 text-status-progress-fg">
                {term ? <Search aria-hidden="true" className="size-5" /> : <ShieldCheck aria-hidden="true" className="size-5" />}
              </div>
              <p className="text-sm font-semibold">{term ? 'Никого не нашли' : filter === 'granted' ? 'Доступ есть только у администратора' : 'Список пользователей пуст'}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {term ? 'Попробуйте другое имя или адрес почты.' : filter === 'granted' ? 'Выдайте доступ участникам на вкладке «Все».' : 'Синхронизируйте участников на странице «Пользователи».'}
              </p>
              {term || filter === 'granted' ? (
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { setFilter('all'); clearSearch(); }}>Показать всех</Button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function RoadmapProjectAccessPage() {
  const [projectKey, setProjectKey] = useState('');
  const demo = isRoadmapDemoMode();
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'project-access', 'projects'], queryFn: projectAccessApi.projects, enabled: !demo });
  const projects = (projectsQuery.data?.data ?? []).filter((project) => project.roadmapId);
  const project = projects.find((item) => item.id === projectKey) ?? projects[0];

  return (
    <AdminPage>
      <AdminPageHeader title="Доступ к проектам" description="Выберите проект и назначьте участникам право просмотра или редактирования плана." />
      {demo ? <p className="text-sm text-muted-foreground">Управление доступом доступно для подключённых проектов Roadmap.</p> : <>
        {!project?.roadmapId ? <QueryErrorNotice title="Не удалось загрузить проекты" queries={[projectsQuery]} /> : null}
        {projectsQuery.isSuccess && !projects.length ? <p className="text-sm text-muted-foreground">Импортируйте проект из Azure DevOps, чтобы настроить доступ.</p> : null}
        <AzureProjectPicker projects={projects} value={project?.id ?? ''} onChange={setProjectKey} disabled={projectsQuery.isPending || !projects.length} placeholder="Выберите проект" />
        {projectsQuery.isPending ? <section aria-label="Доступ к проекту" className="@container rounded-xl border border-border bg-card"><AccessListSkeleton /></section> : null}
        {project?.roadmapId ? <ProjectMembers key={project.roadmapId} projectId={project.roadmapId} projectName={project.name} projectsQuery={projectsQuery} /> : null}
      </>}
    </AdminPage>
  );
}
