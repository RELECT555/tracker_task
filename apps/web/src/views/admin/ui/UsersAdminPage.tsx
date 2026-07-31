'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Eye,
  Landmark,
  Loader2,
  Pencil,
  Shield,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  adminApi,
  type AdminRole,
  type AdminUser,
  type UpdateAdminUserInput,
} from '@/entities/admin/api/adminApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { formatAdminApiError } from '@/shared/lib/admin-errors';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { AdminNav } from '@/widgets/admin-nav/AdminNav';

const ROLE_ICONS: Record<string, LucideIcon> = {
  admin: Shield,
  director: Landmark,
  manager: Users,
  employee: User,
  observer: Eye,
};

const ROLE_HINTS: Record<string, string> = {
  admin: 'Полный доступ к администрированию',
  director: 'Стратегический обзор и эскалации',
  manager: 'Обработка запросов подразделения',
  employee: 'Подача и отслеживание своих запросов',
  observer: 'Только просмотр без изменений',
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {active ? 'Активен' : 'Отключён'}
    </span>
  );
}

function UserEditForm({
  user,
  orgUnits,
  managers,
  roles,
  onCancel,
  onSave,
  isPending,
}: {
  user: AdminUser;
  orgUnits: { id: string; name: string }[];
  managers: { id: string; fullName: string }[];
  roles: AdminRole[];
  onCancel: () => void;
  onSave: (input: UpdateAdminUserInput) => void;
  isPending: boolean;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [isActive, setIsActive] = useState(user.isActive);
  const [orgUnitId, setOrgUnitId] = useState(user.orgUnit?.id ?? '');
  const [managerId, setManagerId] = useState(user.manager?.id ?? '');
  const [roleCodes, setRoleCodes] = useState(user.roles.map((role) => role.code));
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (code: string) => {
    setRoleCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Укажите ФИО');
      return;
    }

    if (roleCodes.length === 0) {
      setError('Выберите хотя бы одну роль');
      return;
    }

    onSave({
      fullName: fullName.trim(),
      isActive,
      orgUnitId: orgUnitId || undefined,
      managerId: managerId || null,
      roleCodes,
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-0 p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <CardTitle className="text-lg">Редактирование пользователя</CardTitle>
            <p className="mt-1 truncate text-sm font-medium text-foreground">
              {user.fullName}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">{user.email}</p>
          </div>
          <StatusBadge active={isActive} />
        </div>

        {error ? (
          <div className="px-5 pt-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 p-5">
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Профиль</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Основные данные и организационная привязка
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-full-name">ФИО</Label>
                  <Input
                    id="user-full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-email">Email</Label>
                  <Input id="user-email" value={user.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Подразделение</Label>
                  <Select value={orgUnitId} onValueChange={setOrgUnitId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите подразделение" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgUnits.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Руководитель</Label>
                  <Select
                    value={managerId || '__none__'}
                    onValueChange={(value) => setManagerId(value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Не назначен" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Не назначен</SelectItem>
                      {managers
                        .filter((manager) => manager.id !== user.id)
                        .map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.fullName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-6">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Роли и доступ</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Можно назначить несколько ролей. Выбрано: {roleCodes.length}
                </p>
              </div>

              <div
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                role="group"
                aria-label="Роли пользователя"
              >
                {roles.map((role) => {
                  const selected = roleCodes.includes(role.code);
                  const Icon = ROLE_ICONS[role.code] ?? User;
                  const hint = role.description?.trim() || ROLE_HINTS[role.code];

                  return (
                    <button
                      key={role.code}
                      type="button"
                      onClick={() => toggleRole(role.code)}
                      aria-pressed={selected}
                      className={cn(
                        'group relative flex min-h-[5.5rem] flex-col items-start gap-2 rounded-lg border p-3.5 text-left transition-colors duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        selected
                          ? 'border-primary/45 bg-primary/10'
                          : 'border-border bg-field hover:bg-muted/40 dark:bg-field',
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                            selected
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted/60 text-muted-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-transparent',
                          )}
                          aria-hidden
                        >
                          <Check className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight text-foreground">
                          {role.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {role.code}
                        </p>
                        {hint ? (
                          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                            {hint}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/25 px-4 py-3 dark:bg-muted/10">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Учётная запись активна</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Отключённые пользователи не могут войти в систему
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  aria-label="Учётная запись активна"
                  onClick={() => setIsActive((value) => !value)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    isActive ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out',
                      isActive && 'translate-x-5',
                    )}
                  />
                </button>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 px-5 py-4 dark:bg-muted/10">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
              Отмена
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function UsersAdminPage() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: () => adminApi.listUsers(),
  });

  const rolesQuery = useQuery({
    queryKey: queryKeys.admin.roles(),
    queryFn: () => adminApi.listRoles(),
  });

  const orgUnitsQuery = useQuery({
    queryKey: queryKeys.admin.orgUnits(),
    queryFn: () => adminApi.listOrgUnits(),
  });

  const managers = useMemo(
    () =>
      (usersQuery.data?.data ?? [])
        .filter((user) => user.isActive)
        .map((user) => ({ id: user.id, fullName: user.fullName })),
    [usersQuery.data],
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminUserInput }) =>
      adminApi.updateUser(id, input),
    onSuccess: () => {
      setMutationError(null);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
    },
    onError: (err: Error) => setMutationError(formatAdminApiError(err)),
  });

  return (
    <DashboardShell
      title="Пользователи"
      description="Учётные записи, роли и организационная привязка"
    >
      <AdminNav />

      {mutationError && !editingUser ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      ) : null}

      {editingUser ? (
        <div className="mt-6">
          <UserEditForm
            user={editingUser}
            orgUnits={orgUnitsQuery.data?.flat ?? []}
            managers={managers}
            roles={rolesQuery.data?.data ?? []}
            isPending={updateMutation.isPending}
            onCancel={() => setEditingUser(null)}
            onSave={(input) => updateMutation.mutate({ id: editingUser.id, input })}
          />
        </div>
      ) : null}

      {!editingUser && usersQuery.isLoading && (
        <div className="mt-6">
          <TableSkeleton rows={5} />
        </div>
      )}

      {!editingUser && usersQuery.error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{(usersQuery.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {!editingUser && usersQuery.data && (
        <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)] dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 dark:bg-muted/25">
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Пользователь</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Подразделение</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Руководитель</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Роли</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Статус</th>
                  <th className="px-5 py-3.5 text-right font-medium text-muted-foreground"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usersQuery.data.data.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {user.orgUnit?.name ?? '—'}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {user.manager?.fullName ?? '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role.code}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                            title={role.code}
                          >
                            <span className="font-medium text-foreground/80">{role.name}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge active={user.isActive} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditingUser(user)}>
                        <Pencil className="h-4 w-4" />
                        Изменить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
