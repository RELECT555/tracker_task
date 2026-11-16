import { handleUnauthorizedResponse } from '@/shared/lib/auth-session';
import { clearTokens, getAccessToken, getSessionId } from '@/shared/lib/auth-storage';
import type { AuthProvider } from './types';

/** Local administrator sign-in with the API's own access and refresh tokens. */
export const localAuthProvider: AuthProvider = {
  kind: 'local',
  getSessionId,
  getAccessToken: async () => getAccessToken(),
  handleUnauthorized: handleUnauthorizedResponse,
  signOut: async () => clearTokens(),
};
