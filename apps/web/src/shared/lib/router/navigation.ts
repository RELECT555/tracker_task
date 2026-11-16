import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router';

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}

type NavigateOptions = { scroll?: boolean };

export function useRouter() {
  const navigate = useNavigate();
  const push = useCallback((to: string, _options?: NavigateOptions) => navigate(to), [navigate]);
  const replace = useCallback((to: string, _options?: NavigateOptions) => navigate(to, { replace: true }), [navigate]);
  const back = useCallback(() => navigate(-1), [navigate]);
  const forward = useCallback(() => navigate(1), [navigate]);
  // В SPA нет серверных компонентов: refresh/prefetch оставлены для совместимости.
  const refresh = useCallback(() => undefined, []);
  const prefetch = useCallback((_to: string) => undefined, []);

  return useMemo(
    () => ({ push, replace, back, forward, refresh, prefetch }),
    [push, replace, back, forward, refresh, prefetch],
  );
}
