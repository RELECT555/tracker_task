import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getSessionId,
  updateTokens,
} from '@/shared/lib/auth-storage';
import { refreshOutcomeForStatus, type RefreshOutcome } from '@/shared/lib/refresh-outcome';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

export const AUTH_EXPIRED_EVENT = 'tracker:auth-expired';

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const pendingRefreshes = new Map<string, Promise<RefreshOutcome>>();

function notifyAuthExpired(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

async function refreshAccessToken(sessionId: string, refreshToken: string): Promise<RefreshOutcome> {
  const pending = pendingRefreshes.get(sessionId);
  if (pending) return pending;
  const refresh = (async (): Promise<RefreshOutcome> => {
    try {
      const response = await fetch(`${baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return refreshOutcomeForStatus(response.status);
      }

      const data = (await response.json()) as RefreshResponse;
      if (getSessionId() !== sessionId) return 'rejected';
      if (getRefreshToken() === refreshToken) {
        updateTokens(data.accessToken, data.refreshToken);
      }
      return 'refreshed';
    } catch {
      // Offline or a broken response: the session itself is untouched.
      return 'unavailable';
    }
  })().finally(() => pendingRefreshes.delete(sessionId));
  pendingRefreshes.set(sessionId, refresh);
  return refresh;
}

/**
 * Called after a 401. `refreshed` means the request can be retried with the current token;
 * `rejected` means the session is gone (the user is signed out); `unavailable` means the token
 * could not be refreshed right now but the session is kept.
 */
export async function handleUnauthorizedResponse(sessionId: string, accessToken: string): Promise<RefreshOutcome> {
  if (getSessionId() !== sessionId) return 'rejected';
  if (getAccessToken() !== accessToken) return 'refreshed';
  const refreshToken = getRefreshToken();
  const outcome = refreshToken ? await refreshAccessToken(sessionId, refreshToken) : 'rejected';
  if (getSessionId() !== sessionId) return 'rejected';
  if (outcome !== 'rejected') return outcome;
  // Another tab may have signed in again or refreshed while this request was waiting.
  if (getAccessToken() !== accessToken) return 'refreshed';
  notifyAuthExpired();
  return 'rejected';
}
