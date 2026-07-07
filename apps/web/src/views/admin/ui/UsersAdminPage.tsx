'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  adminApi,
  type AdminUser,
  type UpdateAdminUserInput,
} from '@/entities/admin/api/adminApi';
import { queryKeys } from '@/shared/api/queryKeys';
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
  roles: { code: string; name: string }[];
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
    <Card>
      <CardContent className="space-y-5 p-5">
        <CardTitle className="text-lg">Редактирование: {user.email}</CardTitle>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-full-name">ФИО</Label>
              <Input
                id="user-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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

          <div className="space-y-2">
            <Label>Роли</Label>
            <div className="flex flex-wrap gap-3">
              {roles.map((role) => (
                <label key={role.code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={roleCodes.includes(role.code)}
                    onChange={() => toggleRole(role.code)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>{role.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{role.code}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Учётная запись активна
          </label>

          <div className="flex flex-wrap gap-2">
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
    onError: (err: Error) => setMutationError(err.message),
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
                <tr className="border-b border-border bg-muted dark:bg-muted/25">
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
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                          >
                            {role.code}
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
