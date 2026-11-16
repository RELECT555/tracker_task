import type { RefreshOutcome } from '../refresh-outcome';
import type { AuthProvider } from './types';

/** The part of MSAL's `IPublicClientApplication` this session uses. */
export interface MsalAccount {
  homeAccountId: string;
}

export interface MsalClient<Account extends MsalAccount = MsalAccount> {
  handleRedirectPromise(): Promise<{ account: Account | null; state?: string } | null>;
  getActiveAccount(): Account | null;
  setActiveAccount(account: Account | null): void;
  getAllAccounts(): Account[];
  acquireTokenSilent(request: { scopes: string[]; account: Account; forceRefresh?: boolean }): Promise<{ accessToken: string }>;
  clearCache(request: { account: Account }): Promise<void>;
  loginRedirect(request: { scopes: string[]; state?: string }): Promise<void>;
  logoutRedirect(request: { account: Account }): Promise<void>;
}

export interface EntraSessionOptions {
  scopes: string[];
  isInteractionRequired(error: unknown): boolean;
  /** Tells the app the session is over (`AUTH_EXPIRED_EVENT`). */
  onSignedOut(): void;
  navigate(path: string): void;
  currentPath(): string;
  /** Safe in-app path for the `state` returned from the sign-in redirect. */
  redirectTarget(state: string | null): string;
}

export interface EntraAuthProvider extends AuthProvider {
  readonly kind: 'entra';
  /** Why the sign-in redirect that just returned failed (cancelled, consent declined, AADSTS…). */
  readonly signInError: unknown;
  /** Sends the browser to Microsoft sign-in; comes back to the login page, then to `redirectTo`. */
  signInRedirect(redirectTo: string): Promise<void>;
}

export interface EntraSession {
  provider: EntraAuthProvider;
  redirectError: unknown;
}

export async function createEntraSession<Account extends MsalAccount>(
  msal: MsalClient<Account>,
  options: EntraSessionOptions,
): Promise<EntraSession> {
  let redirectError: unknown = null;
  const result = await msal.handleRedirectPromise().catch((error: unknown) => {
    redirectError = error;
    return null;
  });
  if (result?.account) {
    msal.setActiveAccount(result.account);
    const target = options.redirectTarget(result.state ?? null);
    if (target !== options.currentPath()) options.navigate(target);
  } else if (!msal.getActiveAccount()) {
    const [account] = msal.getAllAccounts();
    if (account) msal.setActiveAccount(account);
  }

  const acquire = async (forceRefresh: boolean): Promise<string | null> => {
    const account = msal.getActiveAccount();
    if (!account) return null;
    const response = await msal.acquireTokenSilent({ scopes: options.scopes, account, forceRefresh });
    return response.accessToken || null;
  };

  // Forget the account in MSAL's cache too, or the next page load would pick it up again.
  const signedOut = async () => {
    const account = msal.getActiveAccount();
    msal.setActiveAccount(null);
    if (account) await msal.clearCache({ account }).catch(() => undefined);
    options.onSignedOut();
  };

  const provider: EntraAuthProvider = {
    kind: 'entra',
    signInError: redirectError,
    getSessionId: () => msal.getActiveAccount()?.homeAccountId ?? null,

    async getAccessToken() {
      try {
        return await acquire(false);
      } catch (error) {
        if (!options.isInteractionRequired(error)) throw error;
        await signedOut();
        return null;
      }
    },

    async handleUnauthorized(sessionId: string, token: string): Promise<RefreshOutcome> {
      if (msal.getActiveAccount()?.homeAccountId !== sessionId) return 'rejected';
      try {
        const fresh = await acquire(true);
        if (fresh && fresh !== token) return 'refreshed';
      } catch (error) {
        if (!options.isInteractionRequired(error)) return 'unavailable';
      }
      await signedOut();
      return 'rejected';
    },

    async signOut() {
      const account = msal.getActiveAccount();
      msal.setActiveAccount(null);
      if (account) await msal.logoutRedirect({ account });
    },

    async signInRedirect(redirectTo: string) {
      await msal.loginRedirect({ scopes: options.scopes, state: redirectTo });
    },
  };
  return { provider, redirectError };
}
