import { loadAuthProvider } from '@/shared/lib/auth';

export const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type ApiFetchOptions = RequestInit & {
  skipAuth?: boolean;
  _retry?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildHeaders(options?: ApiFetchOptions, token?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function apiFetch<T>(
  path: string,
  options?: ApiFetchOptions,
  origin = baseURL,
): Promise<T> {
  const provider = options?.skipAuth ? null : await loadAuthProvider();
  const token = provider ? await provider.getAccessToken() : null;
  const sessionId = token && provider ? provider.getSessionId() : null;
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: buildHeaders(options, token),
  });

  if (
    response.status === 401 &&
    !options?._retry &&
    provider &&
    token &&
    sessionId
  ) {
    const body = await response.json().catch(() => ({}));
    const code = body?.error?.code as string | undefined;

    if (code === 'UNAUTHORIZED' || !code) {
      const outcome = await provider.handleUnauthorized(sessionId, token);
      if (outcome === 'refreshed' && provider.getSessionId() === sessionId) {
        return apiFetch<T>(path, { ...options, _retry: true }, origin);
      }
      if (outcome === 'unavailable') {
        // The session is still valid; a 5xx keeps callers' own retry/notice logic out of the "signed out" path.
        throw new ApiError('Не удалось обновить сессию. Попробуйте ещё раз.', 'REFRESH_UNAVAILABLE', 503);
      }
    }

    throw new ApiError(
      body?.error?.message ?? 'Session expired',
      code ?? 'UNAUTHORIZED',
      401,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const nestMessage = Array.isArray(body?.message)
      ? body.message.join('; ')
      : typeof body?.message === 'string'
        ? body.message
        : undefined;
    const message =
      body?.error?.message ?? nestMessage ?? `Request failed: ${response.status}`;
    throw new ApiError(message, body?.error?.code, response.status);
  }

  const data = await response.json() as T;
  if (provider && provider.getSessionId() !== sessionId) {
    throw new ApiError('Session changed', 'SESSION_CHANGED', 401);
  }
  return data;
}
