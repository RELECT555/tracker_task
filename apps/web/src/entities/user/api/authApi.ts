import { apiFetch } from '@/shared/api/client';
import type { LoginDto } from '@tracker/shared';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  orgUnit: { id: string; name: string } | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export const authApi = {
  login(dto: LoginDto) {
    return apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(dto),
      skipAuth: true,
    });
  },

  me() {
    return apiFetch<MeResponse>('/auth/me');
  },

  refresh(refreshToken: string) {
    return apiFetch<Omit<LoginResponse, 'user'>>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      skipAuth: true,
    });
  },
};
