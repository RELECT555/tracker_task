export function isAuthRequired(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_REQUIRED === 'true';
}

export function safeRedirectPath(path: string | null, fallback: string): string {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    return path;
  }
  return fallback;
}
