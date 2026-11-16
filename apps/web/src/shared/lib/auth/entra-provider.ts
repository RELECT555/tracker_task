import {
  createStandardPublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import type { AuthClientConfig } from '@tracker/shared';
import { safeRedirectPath } from '@/shared/config/auth';
import { routes } from '@/shared/config/routes';
import { AUTH_EXPIRED_EVENT } from '@/shared/lib/auth-session';
import type { RefreshOutcome } from '@/shared/lib/refresh-outcome';
import type { AuthProvider } from './types';

type EntraConfig = Extract<AuthClientConfig, { provider: 'entra' }>;

export interface EntraAuthProvider extends AuthProvider {
  readonly kind: 'entra';
  /** Sends the browser to Microsoft sign-in; comes back to the login page, then to `redirectTo`. */
  signInRedirect(redirectTo: string): Promise<void>;
}

/** Microsoft Entra ID sign-in via MSAL; tokens never touch our own storage keys. */
export async function createEntraProvider(config: EntraConfig): Promise<EntraAuthProvider> {
  const origin = window.location.origin;
  const msal: IPublicClientApplication = await createStandardPublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: `${origin}${routes.login}`,
      postLogoutRedirectUri: `${origin}${routes.login}`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  const result = await msal.handleRedirectPromise();
  if (result?.account) {
    msal.setActiveAccount(result.account);
    const target = safeRedirectPath(result.state ?? null, routes.home);
    if (target !== `${window.location.pathname}${window.location.search}`) {
      window.location.replace(target);
    }
  } else if (!msal.getActiveAccount()) {
    const [account] = msal.getAllAccounts();
    if (account) msal.setActiveAccount(account);
  }

  const acquire = async (forceRefresh: boolean): Promise<string | null> => {
    const account = msal.getActiveAccount();
    if (!account) return null;
    const response = await msal.acquireTokenSilent({ scopes: config.scopes, account, forceRefresh });
    return response.accessToken || null;
  };

  const signedOut = () => {
    msal.setActiveAccount(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  };

  return {
    kind: 'entra',
    getSessionId: () => msal.getActiveAccount()?.homeAccountId ?? null,

    async getAccessToken() {
      try {
        return await acquire(false);
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) return null;
        throw error;
      }
    },

    async handleUnauthorized(sessionId: string, token: string): Promise<RefreshOutcome> {
      if (msal.getActiveAccount()?.homeAccountId !== sessionId) return 'rejected';
      try {
        const fresh = await acquire(true);
        if (fresh && fresh !== token) return 'refreshed';
      } catch (error) {
        if (!(error instanceof InteractionRequiredAuthError)) return 'unavailable';
      }
      signedOut();
      return 'rejected';
    },

    async signOut() {
      const account = msal.getActiveAccount();
      msal.setActiveAccount(null);
      if (account) await msal.logoutRedirect({ account });
    },

    async signInRedirect(redirectTo: string) {
      await msal.loginRedirect({ scopes: config.scopes, state: redirectTo });
    },
  };
}
