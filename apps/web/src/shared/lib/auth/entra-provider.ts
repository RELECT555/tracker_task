import {
  createStandardPublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser';
import type { AuthClientConfig } from '@tracker/shared';
import { safeRedirectPath } from '@/shared/config/auth';
import { routes } from '@/shared/config/routes';
import { AUTH_EXPIRED_EVENT } from '@/shared/lib/auth-session';
import { createEntraSession, type EntraAuthProvider } from './entra-session';

export type { EntraAuthProvider } from './entra-session';

type EntraConfig = Extract<AuthClientConfig, { provider: 'entra' }>;

/** Microsoft Entra ID sign-in via MSAL; tokens never touch our own storage keys. */
export async function createEntraProvider(config: EntraConfig): Promise<EntraAuthProvider> {
  const origin = window.location.origin;
  const msal = await createStandardPublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: `${origin}${routes.login}`,
      postLogoutRedirectUri: `${origin}${routes.login}`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  const { provider } = await createEntraSession<AccountInfo>(msal, {
    scopes: config.scopes,
    isInteractionRequired: (error) => error instanceof InteractionRequiredAuthError,
    onSignedOut: () => window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)),
    navigate: (path) => window.location.replace(path),
    currentPath: () => `${window.location.pathname}${window.location.search}`,
    redirectTarget: (state) => safeRedirectPath(state, routes.home),
  });
  return provider;
}
