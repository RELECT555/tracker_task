import type { RefreshOutcome } from '../refresh-outcome';

export type AuthProviderKind = 'local' | 'entra';

/** One sign-in backend (our own JWT or Microsoft Entra ID) as the rest of the app sees it. */
export interface AuthProvider {
  readonly kind: AuthProviderKind;
  /** Synchronous so `useSyncExternalStore` can read it; `null` when signed out. */
  getSessionId(): string | null;
  getAccessToken(): Promise<string | null>;
  /** Called after a 401 for `token`; see `RefreshOutcome`. */
  handleUnauthorized(sessionId: string, token: string): Promise<RefreshOutcome>;
  signOut(): Promise<void>;
}
