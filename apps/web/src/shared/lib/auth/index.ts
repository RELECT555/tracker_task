import type { AuthClientConfig } from '@tracker/shared';
import { localAuthProvider } from './local-provider';
import { createProviderLoader } from './provider-loader';
import type { AuthProvider } from './types';
import type { EntraAuthProvider } from './entra-provider';

export type { AuthProvider, AuthProviderKind } from './types';
export type { EntraAuthProvider } from './entra-provider';
export { AUTH_EXPIRED_EVENT } from '@/shared/lib/auth-session';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

async function fetchAuthConfig(): Promise<AuthClientConfig> {
  const response = await fetch(`${baseURL}/auth/config`);
  if (!response.ok) throw new Error(`Auth config request failed: ${response.status}`);
  return (await response.json()) as AuthClientConfig;
}

async function buildProvider(config: AuthClientConfig): Promise<AuthProvider> {
  if (config.provider === 'local') return localAuthProvider;
  // MSAL is loaded only when the API is switched to Entra ID.
  const { createEntraProvider } = await import('./entra-provider');
  return createEntraProvider(config);
}

const loader = createProviderLoader(fetchAuthConfig, buildProvider);

/** The sign-in provider the API is configured for (`AUTH_PROVIDER`), loaded once. */
export const loadAuthProvider = (): Promise<AuthProvider> => loader.load();

export function isEntraProvider(provider: AuthProvider | null): provider is EntraAuthProvider {
  return provider?.kind === 'entra';
}

/** Current session id; before the provider is known, falls back to the local token storage. */
export function getSessionId(): string | null {
  return (loader.current() ?? localAuthProvider).getSessionId();
}
