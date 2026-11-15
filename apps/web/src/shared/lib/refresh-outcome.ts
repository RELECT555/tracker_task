export type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

/**
 * The server refused the refresh token itself (expired, revoked, malformed), so the session is over.
 * Any other failure (5xx, gateway errors, rate limits, a dropped connection) says nothing about the
 * session: the user must stay signed in and the request can simply be tried again.
 */
export function refreshOutcomeForStatus(status: number): Exclude<RefreshOutcome, 'refreshed'> {
  return status === 400 || status === 401 || status === 403 ? 'rejected' : 'unavailable';
}
