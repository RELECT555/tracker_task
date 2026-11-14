export function safeRedirectPath(path: string | null, fallback: string): string {
  const base = 'https://tracker.local';
  if (!path?.startsWith('/')) return fallback;
  try {
    const target = new URL(path, base);
    return target.origin === base && !target.pathname.startsWith('//')
      ? `${target.pathname}${target.search}${target.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
