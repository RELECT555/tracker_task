const ACCESS_TOKEN_KEY = 'tracker.accessToken';
const REFRESH_TOKEN_KEY = 'tracker.refreshToken';
const SESSION_ID_KEY = 'tracker.sessionId';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(SESSION_ID_KEY, Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'));
  updateTokens(accessToken, refreshToken);
}

export function getSessionId(): string | null {
  if (!getAccessToken()) return null;
  return localStorage.getItem(SESSION_ID_KEY) ?? 'legacy';
}

export function updateTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(SESSION_ID_KEY);
}

export function hasAccessToken(): boolean {
  return Boolean(getAccessToken());
}
