import { getAccessToken } from '@/shared/lib/auth-storage';
import { handleUnauthorizedResponse } from '@/shared/lib/auth-session';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

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

function buildHeaders(options?: ApiFetchOptions): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (!options?.skipAuth && typeof window !== 'undefined') {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

export async function apiFetch<T>(
  path: string,
  options?: ApiFetchOptions,
): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, {
    ...options,
    headers: buildHeaders(options),
  });

  if (
    response.status === 401 &&
    !options?.skipAuth &&
    !options?._retry &&
    typeof window !== 'undefined' &&
    getAccessToken()
  ) {
    const body = await response.json().catch(() => ({}));
    const code = body?.error?.code as string | undefined;

    if (code === 'UNAUTHORIZED' || !code) {
      const refreshed = await handleUnauthorizedResponse();
      if (refreshed) {
        return apiFetch<T>(path, { ...options, _retry: true });
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

  return response.json() as Promise<T>;
}
