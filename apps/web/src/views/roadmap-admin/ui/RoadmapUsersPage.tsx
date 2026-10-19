'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, Users } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ColorMark } from '@/shared/ui/color-mark';
import { AdminAlert, AdminPage, AdminPageHeader, personInitials } from './AdminLayout';

const MAX_VISIBLE_ROLES = 3;

export function RoadmapUsersPage() {
  const client = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const usersQuery = useQuery({ queryKey: ['roadmap', 'admin', 'users'], queryFn: roadmapApi.adminPeople });
  const sync = useMutation({
    mutationFn: roadmapApi.syncAdminPeople,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['roadmap', 'admin', 'users'] }),
        client.invalidateQueries({ queryKey: ['roadmap', 'people'] }),
        client.invalidateQueries({ queryKey: ['roadmap', 'roles'] }),
      ]);
    },
  });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const activeCount = users.filter((person) => person.isActive).length;
  const visibleUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    return users.filter((person) => (showInactive || person.isActive) && (!term || `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term)));
  }, [users, showInactive, search]);
  const error = usersQuery.error ?? sync.error;

  return (
    <AdminPage>
      <AdminPageHeader
        title="Пользователи"
        description="Участники организации из Azure DevOps. Активных можно назначать на роли в проектах."
        actions={<Button onClick={() => sync.mutate()} disabled={sync.isPending} className="h-9 gap-2"><RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} />{sync.isPending ? 'Синхронизация…' : 'Синхронизировать'}</Button>}
      />

      {error ? <AdminAlert tone="error">{error instanceof Error ? error.message : 'Не удалось загрузить пользователей'}</AdminAlert> : null}
      {sync.data ? <AdminAlert tone="success">Синхронизировано людей: {sync.data.synced}{sync.data.ignored ? ` · служебных или неподходящих записей пропущено: ${sync.data.ignored}` : ''}</AdminAlert> : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div role="tablist" aria-label="Фильтр по статусу" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
            {[{ value: false, label: 'Активные', count: activeCount }, { value: true, label: 'Все', count: users.length }].map((option) => (
              <button
                key={option.label}
                type="button"
                role="tab"
                aria-selected={showInactive === option.value}
                onClick={() => setShowInactive(option.value)}
                className={cn('rounded-md px-3 py-1.5 font-medium transition-colors', showInactive === option.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {option.label} <span className="ml-0.5 tabular-nums text-muted-foreground">{option.count}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти по имени или почте" aria-label="Найти пользователя" className="h-9 w-full rounded-lg border border-input bg-field pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30 dark:border-border/70" />
          </label>
        </div>

        {usersQuery.isLoading ? <div className="p-10 text-center text-sm text-muted-foreground">Загружаем участников…</div> : visibleUsers.length ? (
          <>
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_110px] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Участник</span><span>Роли в проектах</span><span className="text-right">Статус</span>
            </div>
            <ul className="divide-y divide-border">
              {visibleUsers.map((person) => {
                const roles = person.roles ?? [];
                const hiddenRoles = roles.length - MAX_VISIBLE_ROLES;
                return <li key={person.id} className={cn('grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_110px] md:items-center md:gap-4', !person.isActive && 'opacity-60')}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', person.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{personInitials(person.name)}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">{person.name}{person.isMock ? <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}</p>
                      <p className="truncate text-xs text-muted-foreground">{person.email ?? 'Email не указан'}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {roles.length ? roles.slice(0, MAX_VISIBLE_ROLES).map((role) => (
                      <span key={role.id} title={role.projectName ? `${role.projectName} · ${role.name}` : role.name} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground">
                        <ColorMark color={role.color} size="xs" />
                        <span className="truncate">{role.name}{role.projectName ? <span className="text-muted-foreground"> · {role.projectName}</span> : null}</span>
                      </span>
                    )) : <span className="text-xs text-muted-foreground">Без ролей</span>}
                    {hiddenRoles > 0 ? <span title={roles.slice(MAX_VISIBLE_ROLES).map((role) => role.name).join(', ')} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">+{hiddenRoles}</span> : null}
                  </div>
                  <div className="md:text-right">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', person.isActive ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', person.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
                      {person.isActive ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                </li>;
              })}
            </ul>
          </>
        ) : (
          <div className="px-6 py-14 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium text-foreground">{search.trim() ? 'Никого не нашли' : 'Список пуст'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{search.trim() ? 'Попробуйте другое имя или почту.' : 'Нажмите «Синхронизировать», чтобы загрузить людей из Azure DevOps.'}</p>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
