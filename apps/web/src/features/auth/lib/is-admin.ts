import type { AuthUser } from '@/entities/user/api/authApi';

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.roles.includes('admin') === true;
}
