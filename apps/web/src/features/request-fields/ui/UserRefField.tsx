'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/entities/admin/api/adminApi';
import type { AuthUser } from '@/entities/user/api/authApi';
import { queryKeys } from '@/shared/api/queryKeys';

interface UserRefFieldProps {
  id: string;
  value: unknown;
  onChange: (value: string) => void;
  user: AuthUser | null;
}

export function UserRefField({ id, value, onChange, user }: UserRefFieldProps) {
  const isAdmin = Boolean(user?.roles.includes('admin'));

  const usersQuery = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: () => adminApi.listUsers(),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const options: { id: string; label: string }[] = [];

  if (user?.manager) {
    options.push({
      id: user.manager.id,
      label: `${user.manager.fullName} (мой руководитель)`,
    });
  }

  if (isAdmin && usersQuery.data?.data) {
    for (const entry of usersQuery.data.data) {
      if (entry.isActive && !options.some((option) => option.id === entry.id)) {
        options.push({ id: entry.id, label: entry.fullName });
      }
    }
  }

  const stringValue = value === undefined || value === null ? '' : String(value);

  if (options.length === 0) {
    return (
      <select
        id={id}
        value={stringValue}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <option value="">— Выберите сотрудника —</option>
        {stringValue ? (
          <option value={stringValue}>{stringValue}</option>
        ) : null}
      </select>
    );
  }

  return (
    <select
      id={id}
      value={stringValue}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <option value="">— Выберите сотрудника —</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
