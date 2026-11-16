'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/shared/lib/router/navigation';
import { useEffect, useState } from 'react';
import type { LoginDto } from '@tracker/shared';
import { authApi } from '@/entities/user/api/authApi';
import { AUTH_EXPIRED_EVENT, isEntraProvider, loadAuthProvider, type AuthProvider } from '@/shared/lib/auth';
import { setTokens } from '@/shared/lib/auth-storage';
import { ApiError } from '@/shared/api/client';
import { routes } from '@/shared/config/routes';

export function useAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<AuthProvider | null>(null);
  const [configError, setConfigError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    loadAuthProvider().then(
      (loaded) => {
        if (!active) return;
        setProvider(loaded);
        setHasToken(loaded.getSessionId() !== null);
      },
      (error: unknown) => {
        if (active) setConfigError(error);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setHasToken(false);
      queryClient.clear();
      if (window.location.pathname !== routes.login) {
        const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
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
    enabled: hasToken === true,
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
      queryClient.clear();
      setTokens(data.accessToken, data.refreshToken);
      setHasToken(true);
      queryClient.setQueryData(['auth', 'me'], { user: data.user });
      const target = variables.redirectTo ?? routes.home;
      router.push(target);
      router.refresh();
    },
  });

  const logout = () => {
    void provider?.signOut();
    setHasToken(false);
    queryClient.clear();
    router.push(routes.login);
    router.refresh();
  };

  return {
    user: meQuery.data?.user ?? null,
    isLoading: hasToken === null || (hasToken && meQuery.isLoading),
    hasToken,
    provider: provider?.kind ?? null,
    configError,
    signInError: isEntraProvider(provider) ? provider.signInError : null,
    profileError: meQuery.error,
    isAuthenticated: hasToken === true && Boolean(meQuery.data?.user),
    login: (dto: LoginDto, redirectTo?: string) =>
      loginMutation.mutateAsync({ dto, redirectTo }),
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    signInWithMicrosoft: (redirectTo: string) =>
      isEntraProvider(provider) ? provider.signInRedirect(redirectTo) : Promise.resolve(),
    logout,
  };
}
