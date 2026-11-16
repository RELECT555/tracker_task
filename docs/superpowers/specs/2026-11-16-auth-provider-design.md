# Auth provider switch (groundwork for MSAL / Entra ID)

## Intent

The app will move to Microsoft Entra ID sign-in (MSAL). We are not switching yet, but the
switch must later be **one setting**: `AUTH_PROVIDER=entra` in the API. Default stays `local`,
so today's behaviour (local admin + own JWT) is unchanged.

## Goals

- API: pluggable access-token verification — local JWT now, Entra later — chosen by `AUTH_PROVIDER`.
- Users can be linked to an Entra account (`oid`).
- Web: one auth abstraction used by `apiFetch`, `useAuth`, `AuthGuard`, login page; local and
  Entra (MSAL) implementations. The web learns the mode from the API, not from its own env.

## Non-goals

- Turning Entra on anywhere, registering the Entra app, real-tenant testing.
- Auto-provisioning users from Entra, syncing roles/groups from Entra.

## Anti-goals

- Any behaviour change in `local` mode.
- Two settings that can disagree (API vs web).

## Approaches considered

1. **Mode from API via `GET /auth/config` (picked).** Single source of truth; costs one
   unauthenticated request before sign-in.
2. Separate `NEXT_PUBLIC_AUTH_PROVIDER` in web. Rejected: two settings, easy to desync.

Token verification: `jose` with remote JWKS (picked) vs `passport-azure-ad` (unmaintained, rejected).

## Design

### API

- `AUTH_PROVIDER` = `local` (default) | `entra`.
- Config validation: `local` requires `JWT_SECRET`, `LOCAL_ADMIN_PASSWORD` (as today).
  `entra` requires `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_API_AUDIENCE`; optional
  `ENTRA_API_SCOPE` (for the web, default `${audience}/access_as_user`). `JWT_SECRET` still
  required in both modes (keeps the JWT module boot simple).
- `AccessTokenVerifier` interface: `verify(token) → { kind: 'local', userId } | { kind: 'entra', oid, tid, email }`.
  - `LocalTokenVerifier` wraps `TokenService.verifyAccessToken`.
  - `EntraTokenVerifier` uses `jose.createRemoteJWKSet` for
    `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`, checks signature,
    `iss = https://login.microsoftonline.com/{tenant}/v2.0`, `aud`, `tid`, expiry; email from
    `preferred_username` / `email` / `upn`.
- User resolution (`AuthUserResolver`): local → by id. Entra → by `externalId = oid`; if none,
  by email (case-insensitive) with `externalId` null, then link it; otherwise 403 `USER_NOT_PROVISIONED`.
  Inactive → 401 as today. Roles come from our DB.
- `User.externalId String? @unique` (`external_id`), Prisma migration.
- `GET /auth/config` (public): `{ provider: 'local' }` or
  `{ provider: 'entra', tenantId, clientId, scopes: [scope] }`.
- In `entra` mode `POST /auth/login` and `/auth/refresh` return 404-style `AUTH_PROVIDER_DISABLED`.
- `AuthMiddleware` uses verifier + resolver; `AuthenticatedUser` shape unchanged.

### Web

- `AuthProvider` interface (`shared/lib/auth/`): `getAccessToken()`, `getSessionId()`,
  `handleUnauthorized(sessionId, token) → RefreshOutcome`, `signOut()`, plus provider-specific
  sign-in (`local`: password login via API; `entra`: `signInRedirect()`).
- Local implementation = existing `auth-storage` + `auth-session` behaviour, unchanged.
- Entra implementation: `@azure/msal-browser` `PublicClientApplication`, redirect login,
  `handleRedirectPromise` on init, `acquireTokenSilent` for tokens/after 401; silent failure → signed out.
- Active provider loaded once from `/auth/config` (cached promise); `apiFetch`/`useAuth`/`AuthGuard`
  go through it. Login page: password form in `local`, “Войти через Microsoft” button in `entra`.

## Verification

- API unit tests: config validation per mode, Entra verifier with locally generated keys + local
  JWKS (valid, wrong aud/iss/tenant, expired), resolver linking rules, `/auth/config`.
- Web: lint + build; local mode manually unchanged. Entra web flow is not verified against a real tenant.

## Left to the builder

File layout inside the existing FSD/clean structure, exact error codes text, MSAL cache location
(`sessionStorage`, builder's call).
