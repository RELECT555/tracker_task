import type { AuthUser } from '@/entities/user/api/authApi';
import { isAuthRequired } from '@/shared/config/auth';

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  if (user?.roles.includes('admin')) {
    return true;
  }

  // Dev mode uses admin@tracker.local as fallback actor on the API.
  return !isAuthRequired();
}
