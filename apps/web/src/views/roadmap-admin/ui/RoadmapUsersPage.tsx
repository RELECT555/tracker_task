'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, Users, X } from 'lucide-react';
import { roadmapApi, type RoadmapPerson } from '@/entities/roadmap/api/roadmapApi';
import { RoadmapPersonAvatar } from '@/entities/roadmap/ui/RoadmapPersonAvatar';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ColorMark } from '@/shared/ui/color-mark';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { AdminAlert, AdminPage, AdminPageHeader, StatusPill } from './AdminLayout';

const MAX_VISIBLE_ROLES = 3;
const statusFilters = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Неактивные' },
] as const;
type StatusFilter = (typeof statusFilters)[number]['value'];

const directoryColumns = '@min-[42rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_6rem] @min-[42rem]:gap-x-6';

function UserRoles({ person }: { person: RoadmapPerson }) {
  const roles = person.roles ?? [];
  if (!roles.length) return <span className="text-xs text-muted-foreground">Без ролей</span>;

  const visibleRoles = roles.slice(0, MAX_VISIBLE_ROLES);
  const remainingRoles = roles.length - visibleRoles.length;

  return (
    <ul aria-label="Роли в проектах" className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visibleRoles.map((role) => (
        <li key={role.id} className="flex max-w-full items-start gap-2 rounded-md border border-border/75 bg-field px-2.5 py-1 text-xs leading-4">
          <ColorMark color={role.color} size="xs" className="mt-[5px]" />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-medium">{role.name}</span>
            {role.projectName ? <span className="text-muted-foreground"> · {role.projectName}</span> : null}
          </span>
        </li>
      ))}
      {remainingRoles > 0 ? (
        <li>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" type="button" aria-label={`Все роли участника «${person.name}»`} className="h-8 rounded-md px-2.5 tabular-nums shadow-none">
                +{remainingRoles}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              aria-label={`Роли участника «${person.name}»`}
              align="start"
              sideOffset={6}
              className="flex max-h-(--radix-popover-content-available-height) w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0"
            >
              <div className="shrink-0 border-b border-border px-3.5 py-2.5">
                <p className="text-sm font-semibold">Роли в проектах</p>
                <p className="mt-0.5 text-xs text-muted-foreground wrap-anywhere">{person.name}</p>
              </div>
              <ul tabIndex={0} className="roadmap-scrollbar min-h-0 max-h-60 space-y-2.5 overflow-auto rounded-b-lg px-3.5 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                {roles.map((role) => (
                  <li key={role.id} className="flex items-start gap-2.5">
                    <ColorMark color={role.color} size="xs" className="mt-[7px]" />
                    <div className="min-w-0 wrap-anywhere">
                      <p className="text-sm font-medium">{role.name}</p>
                      {role.projectName ? <p className="text-xs text-muted-foreground">{role.projectName}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </li>
      ) : null}
    </ul>
  );
}

function UserRow({ person }: { person: RoadmapPerson }) {
  const active = person.isActive !== false;

  return (
    <li className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2.5 px-3 py-3 hover:bg-muted/20 sm:px-5 @min-[42rem]:items-center @min-[42rem]:py-3.5', directoryColumns)}>
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <RoadmapPersonAvatar person={person} />
        <div className="min-w-0 self-center">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 text-sm font-semibold wrap-anywhere">{person.name}</p>
            {person.isMock ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-tight text-muted-foreground">демо</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground wrap-anywhere">{person.email ?? 'Почта не указана'}</p>
        </div>
      </div>
      <div className="col-span-2 min-w-0 pl-[2.875rem] sm:pl-[3.25rem] @min-[42rem]:col-span-1 @min-[42rem]:pl-0">
        <UserRoles person={person} />
      </div>
      <div className="col-start-2 row-start-1 justify-self-end @min-[42rem]:col-start-3">
        <StatusPill active={active} label={active ? 'Активен' : 'Неактивен'} />
      </div>
    </li>
  );
}

function DirectoryEmptyState({ title, description, action, isSearch }: {
  title: string;
  description: string;
  action?: React.ReactNode;
  isSearch?: boolean;
}) {
  const Icon = isSearch ? Search : Users;
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <div className="mb-3 rounded-xl bg-status-progress-bg p-3 text-status-progress-fg">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function RoadmapUsersPage() {
  const client = useQueryClient();
  const searchInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const usersQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const sync = useMutation({
    mutationFn: roadmapApi.syncAdminPeople,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'users'] }),
        client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'user-avatar'] }),
        client.invalidateQueries({ queryKey: ['roadmap', 'people'] }),
        client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
      ]);
    },
  });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const activeCount = useMemo(() => users.filter((person) => person.isActive !== false).length, [users]);
  const counts = { all: users.length, active: activeCount, inactive: users.length - activeCount };
  const term = search.trim().toLocaleLowerCase('ru-RU');
  const visibleUsers = useMemo(() => users.filter((person) => {
    const active = person.isActive !== false;
    const matchesStatus = status === 'all' || active === (status === 'active');
    return matchesStatus && (!term || `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term));
  }), [users, status, term]);

  const blockedByError = usersQuery.isError && !usersQuery.data;

  function clearSearch() {
    setSearch('');
    searchInput.current?.focus();
  }

  function showAll() {
    setStatus('all');
    searchInput.current?.focus();
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Пользователи"
        description="Участники Azure DevOps и их роли в проектах."
        actions={
          <Button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="bg-[color-mix(in_srgb,var(--color-primary)_94%,black)] hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] dark:bg-primary dark:hover:bg-primary/90"
          >
            <RefreshCw aria-hidden="true" className={cn('size-4', sync.isPending && 'motion-safe:animate-spin')} />
            {sync.isPending ? 'Синхронизация…' : 'Синхронизировать'}
          </Button>
        }
      />

      <QueryErrorNotice
        title={sync.error ? 'Не удалось обновить пользователей' : 'Не удалось загрузить пользователей'}
        queries={[usersQuery]}
        errors={[sync.error]}
      />
      {sync.isSuccess ? (
        <AdminAlert tone="success">
          Синхронизировано людей: {sync.data.synced}{sync.data.ignored ? ` · служебных или неподходящих записей пропущено: ${sync.data.ignored}` : ''}
        </AdminAlert>
      ) : null}

      {!blockedByError && <section aria-label="Список пользователей" className="@container rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] dark:shadow-none">
        <div className="flex flex-col items-start gap-3 border-b border-border p-3 sm:px-5 sm:py-4 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
          <div role="group" aria-label="Фильтр по статусу" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-muted/55 p-1">
            {statusFilters.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={status === option.value}
                onClick={() => setStatus(option.value)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:gap-1.5 sm:px-3 sm:text-sm',
                  status === option.value
                    ? 'bg-card text-foreground shadow-sm dark:bg-accent'
                    : 'text-muted-foreground hover:bg-card/55 hover:text-foreground',
                )}
              >
                {option.label}
                {usersQuery.data ? (
                  <span className={cn('min-w-4 rounded px-0.5 text-center text-[11px] leading-[1.4rem] tabular-nums sm:min-w-5 sm:px-1', status === option.value ? 'bg-status-progress-bg text-status-progress-fg' : 'text-muted-foreground')}>
                    {counts[option.value]}
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Очистить поиск"
                onClick={clearSearch}
                className="absolute top-1 right-1 size-8 text-muted-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div aria-busy={usersQuery.isFetching}>
          {term && usersQuery.data ? (
            <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground sm:px-5">Найдено: <span className="font-medium tabular-nums text-foreground">{visibleUsers.length}</span></p>
          ) : null}
          {usersQuery.isPending ? (
            <div role="status" className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
              <RefreshCw aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Загружаем участников…
            </div>
          ) : visibleUsers.length ? (
            <>
              <div aria-hidden="true" className={cn('hidden border-b border-border bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground @min-[42rem]:grid', directoryColumns)}>
                <span>Участник</span>
                <span>Роли в проектах</span>
                <span className="text-right">Статус</span>
              </div>
              <ul className="divide-y divide-border/70">
                {visibleUsers.map((person) => <UserRow key={person.id} person={person} />)}
              </ul>
            </>
          ) : !users.length ? (
            <DirectoryEmptyState
              title="Список пользователей пуст"
              description="Синхронизируйте список, чтобы загрузить участников из Azure DevOps."
            />
          ) : term ? (
            <DirectoryEmptyState
              isSearch
              title="Никого не нашли"
              description="Попробуйте другое имя, адрес почты или статус."
              action={<Button type="button" variant="outline" size="sm" onClick={clearSearch}>Сбросить поиск</Button>}
            />
          ) : (
            <DirectoryEmptyState
              title={status === 'active' ? 'Нет активных участников' : 'Нет неактивных участников'}
              description="Посмотрите список участников со всеми статусами."
              action={<Button type="button" variant="outline" size="sm" onClick={showAll}>Показать всех</Button>}
            />
          )}
        </div>
      </section>}
    </AdminPage>
  );
}
