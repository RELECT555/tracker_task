import { apiFetch } from '@/shared/api/client';

export interface DirectoryUser {
  id: string;
  fullName: string;
  email: string;
}

export const usersApi = {
  list: () => apiFetch<{ data: DirectoryUser[] }>('/users'),
};
