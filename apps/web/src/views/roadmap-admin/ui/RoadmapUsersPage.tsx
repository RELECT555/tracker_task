'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Eye, EyeOff, RefreshCw, Users } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';

export function RoadmapUsersPage() {
  const client = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
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
  const users = usersQuery.data ?? [];
  const activeUsers = users.filter((person) => person.isActive);
  const inactiveCount = users.length - activeUsers.length;
  const visibleUsers = showInactive ? users : activeUsers;
  const error = usersQuery.error ?? sync.error;

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={routes.roadmapAdminHome} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Администрирование</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Администрирование Roadmap</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Пользователи</h1><p className="mt-2 text-sm text-muted-foreground">Участники Azure DevOps, которых можно назначать на роли.</p></div>
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-2"><RefreshCw className={`h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />{sync.isPending ? 'Синхронизация…' : 'Синхронизировать'}</Button>
        </div>
        {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4" />{error instanceof Error ? error.message : 'Не удалось загрузить пользователей'}</div> : null}
        {sync.data ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Синхронизировано людей: {sync.data.synced}{sync.data.ignored ? ` · служебных или неподходящих записей пропущено: ${sync.data.ignored}` : ''}</p> : null}
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><h2 className="font-medium text-foreground">Участники организации</h2><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{activeUsers.length} активных</span>{inactiveCount ? <button type="button" onClick={() => setShowInactive((shown) => !shown)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{showInactive ? 'Скрыть отключённых' : `Показать отключённых · ${inactiveCount}`}</button> : null}</div></div>
          {usersQuery.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Загружаем участников…</div> : visibleUsers.length ? (
            <div className="divide-y divide-border">
              {visibleUsers.map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Users className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{person.name}</p><p className="truncate text-xs text-muted-foreground">{person.email ?? 'Email не указан'}</p></div></div>
                <div className="flex flex-wrap items-center justify-end gap-2">{person.roles?.map((role) => <span key={role.id} className="rounded-full border px-2 py-1 text-xs" style={{ borderColor: `${role.color}66`, color: role.color }}>{role.projectName ? `${role.projectName} · ` : ''}{role.name}</span>)}{person.isMock ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Демо</span> : null}<span className={`rounded-full px-2 py-1 text-xs ${person.isActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{person.isActive ? 'Активен' : 'Неактивен'}</span></div>
              </div>)}
            </div>
          ) : <div className="px-6 py-12 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground/70" /><p className="mt-3 text-sm text-muted-foreground">{showInactive ? 'Список пользователей пока пуст.' : 'Активных участников нет. Синхронизируйте людей из Azure DevOps.'}</p></div>}
        </section>
      </div>
    </main>
  );
}
