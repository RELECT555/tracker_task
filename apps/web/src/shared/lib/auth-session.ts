import {
  clearTokens,
  getRefreshToken,
  setTokens,
} from '@/shared/lib/auth-storage';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const AUTH_EXPIRED_EVENT = 'tracker:auth-expired';

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let refreshPromise: Promise<boolean> | null = null;

export function notifyAuthExpired(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as RefreshResponse;
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function handleUnauthorizedResponse(): Promise<boolean> {
  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    notifyAuthExpired();
  }
  return refreshed;
}
