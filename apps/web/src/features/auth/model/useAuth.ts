'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LoginDto } from '@tracker/shared';
import { authApi } from '@/entities/user/api/authApi';
import { DEV_PASSWORD } from '@/features/auth/lib/dev-accounts';
import { AUTH_EXPIRED_EVENT } from '@/shared/lib/auth-session';
import { clearTokens, getAccessToken, setTokens } from '@/shared/lib/auth-storage';
import { hasSeenWelcome } from '@/shared/lib/onboarding-storage';
import { ApiError } from '@/shared/api/client';
import { routes } from '@/shared/config/routes';

/** Temporary: show the welcome tour after every login, not just the first. */
const ALWAYS_SHOW_WELCOME = true;

export function useAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(getAccessToken()));
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setHasToken(false);
      queryClient.removeQueries({ queryKey: ['auth', 'me'] });
      if (window.location.pathname !== routes.login) {
        const redirect = encodeURIComponent(window.location.pathname);
        router.push(`${routes.login}?redirect=${redirect}`);
        router.refresh();
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, [queryClient, router]);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me(),
    enabled: hasToken,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const loginMutation = useMutation({
    mutationFn: ({ dto }: { dto: LoginDto; redirectTo?: string }) => authApi.login(dto),
    onSuccess: (data, variables) => {
      setTokens(data.accessToken, data.refreshToken);
      setHasToken(true);
      queryClient.setQueryData(['auth', 'me'], { user: data.user });
      // An explicit ?redirect= wins; otherwise first-time users get the tour.
      // TODO: flip ALWAYS_SHOW_WELCOME back to false — it is on so the screen
      // can be reviewed on every login.
      const isFirstVisit = ALWAYS_SHOW_WELCOME || !hasSeenWelcome(data.user.id);
      const target =
        variables.redirectTo ?? (isFirstVisit ? routes.welcome : routes.home);
      router.push(target);
      router.refresh();
    },
  });

  const switchUserMutation = useMutation({
    mutationFn: (email: string) =>
      authApi.login({ email, password: DEV_PASSWORD }),
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setHasToken(true);
      queryClient.clear();
      queryClient.setQueryData(['auth', 'me'], { user: data.user });
      router.push(routes.home);
      router.refresh();
    },
  });

  const logout = () => {
    clearTokens();
    setHasToken(false);
    queryClient.removeQueries({ queryKey: ['auth', 'me'] });
    router.push(routes.login);
    router.refresh();
  };

  return {
    user: meQuery.data?.user ?? null,
    isLoading: hasToken && meQuery.isLoading,
    isAuthenticated: hasToken && Boolean(meQuery.data?.user),
    login: (dto: LoginDto, redirectTo?: string) =>
      loginMutation.mutateAsync({ dto, redirectTo }),
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    switchUser: (email: string) => switchUserMutation.mutateAsync(email),
    isSwitchingUser: switchUserMutation.isPending,
    logout,
  };
}
