import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getSessionId,
  updateTokens,
} from '@/shared/lib/auth-storage';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const AUTH_EXPIRED_EVENT = 'tracker:auth-expired';

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const pendingRefreshes = new Map<string, Promise<boolean>>();

function notifyAuthExpired(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

async function refreshAccessToken(sessionId: string, refreshToken: string): Promise<boolean> {
  const pending = pendingRefreshes.get(sessionId);
  if (pending) return pending;
  const refresh = (async () => {
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
      if (getSessionId() !== sessionId) return false;
      if (getRefreshToken() === refreshToken) {
        updateTokens(data.accessToken, data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  })().finally(() => pendingRefreshes.delete(sessionId));
  pendingRefreshes.set(sessionId, refresh);
  return refresh;
}

export async function handleUnauthorizedResponse(sessionId: string, accessToken: string): Promise<boolean> {
  if (getSessionId() !== sessionId) return false;
  if (getAccessToken() !== accessToken) return true;
  const refreshToken = getRefreshToken();
  const refreshed = refreshToken ? await refreshAccessToken(sessionId, refreshToken) : false;
  if (getSessionId() !== sessionId) return false;
  if (!refreshed && getAccessToken() === accessToken) {
    notifyAuthExpired();
    return false;
  }
  return true;
}
