# Auth Provider Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Entra ID (MSAL) sign-in a one-setting switch (`AUTH_PROVIDER=entra` in the API) while `local` stays the default and behaves exactly as today.

**Architecture:** API gets an `AccessTokenVerifier` (local JWT / Entra JWKS) and an `AuthUserResolver` picked by `AUTH_PROVIDER`; `GET /auth/config` tells the web which mode is active. Web gets an `AuthProvider` abstraction (local storage tokens / MSAL) behind `apiFetch`, `useAuth`, `AuthGuard` and the login page.

**Tech Stack:** NestJS 11, Prisma, `jose` (API), Next.js 15 / React 19, `@azure/msal-browser` (web).

**Spec:** `docs/superpowers/specs/2026-11-16-auth-provider-design.md`

## Global Constraints

- Default `AUTH_PROVIDER` is `local`; no behaviour change in `local` mode (same storage keys `tracker.accessToken`, `tracker.refreshToken`, `tracker.sessionId`, same refresh flow).
- Entra issuer `https://login.microsoftonline.com/{tenant}/v2.0`; JWKS `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`.
- `entra` mode requires `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_API_AUDIENCE`; `ENTRA_API_SCOPE` optional, default `${ENTRA_API_AUDIENCE}/access_as_user`. `JWT_SECRET` required in both modes; `LOCAL_ADMIN_PASSWORD` only in `local`.
- No auto-provisioning: unknown Entra user → 403 `USER_NOT_PROVISIONED`. Roles come only from our DB.
- `AuthenticatedUser` shape (`id`, `email`, `isAdmin`) unchanged.
- User-facing copy is Russian.

## Review Focus

- Entra user whose email matches a user already linked to a *different* `oid` → must be 403, not re-linked (Task 3 test).
- Email case differs between Entra and DB (`Ivan@Corp.com` vs `ivan@corp.com`) → still links (Task 3 test).
- `/auth/config` request fails (API down) on web start → guard shows an error, does not redirect-loop to login (Task 5 manual check).
- A local-mode JWT sent to an `entra`-mode API (and vice versa) → 401, never accepted (Task 2 test: local-signed HS256 token rejected by Entra verifier).
- Entra token from another tenant with right audience → 401 (Task 2 test).

---

### Task 1: Config validation per mode

**Files:**
- Modify: `apps/api/src/shared/infrastructure/config/auth-config.ts`
- Test: `apps/api/src/shared/infrastructure/config/auth-config.spec.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `export type AuthProviderKind = 'local' | 'entra'`; `export function authProviderOf(env: Record<string, unknown>): AuthProviderKind` (unset/empty → `'local'`, unknown value → throws `'AUTH_PROVIDER must be local or entra'`). `validateAuthConfig` keeps its signature.

- [x] **Step 1: Add failing tests** to the existing spec:
  - `authProviderOf({})` → `'local'`; `authProviderOf({ AUTH_PROVIDER: 'ENTRA' })` → `'entra'`; `'okta'` throws `AUTH_PROVIDER`.
  - entra mode without `LOCAL_ADMIN_PASSWORD` but with `JWT_SECRET`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_API_AUDIENCE` → passes.
  - entra mode missing each of the three `ENTRA_*` vars → throws that var's name.
  - entra mode with a non-GUID `ENTRA_TENANT_ID` (`'contoso'`) → throws `ENTRA_TENANT_ID`.
  - existing local tests unchanged.
- [x] **Step 2:** `npm test -w @tracker/api -- auth-config` → FAIL.
- [x] **Step 3:** Implement. Tenant must be a GUID (single-tenant app; `common`/`organizations` not supported).
- [x] **Step 4:** Same command → PASS.
- [x] **Step 5:** Add commented `AUTH_PROVIDER=local` and `ENTRA_*` block to `.env.example`. Commit `feat(api): validate auth provider config`.

### Task 2: Token verifiers

**Files:**
- Create: `apps/api/src/modules/identity/infrastructure/access-token-verifier.ts`
- Create: `apps/api/src/modules/identity/infrastructure/entra-token-verifier.ts`
- Test: `apps/api/src/modules/identity/infrastructure/entra-token-verifier.spec.ts`
- Modify: `apps/api/package.json` (add `jose` ^5 as direct dependency)

**Interfaces:**
- Produces (in `access-token-verifier.ts`):
  ```ts
  export type VerifiedIdentity =
    | { kind: 'local'; userId: string }
    | { kind: 'entra'; oid: string; tenantId: string; email: string | null };
  export interface AccessTokenVerifier { verify(token: string): Promise<VerifiedIdentity>; }
  export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');
  export class LocalTokenVerifier implements AccessTokenVerifier { constructor(tokens: TokenService) }
  ```
- Produces (in `entra-token-verifier.ts`):
  `export class EntraTokenVerifier implements AccessTokenVerifier { constructor(options: { tenantId: string; audience: string; keys?: JWTVerifyGetKey }) }` — `keys` defaults to `createRemoteJWKSet(new URL(jwksUrl))`. Email = first string of `preferred_username`, `email`, `upn`, lower-cased, else `null`. Any failure → throws `Error`.

- [x] **Step 1: Failing tests** with `generateKeyPair('RS256')` + `createLocalJWKSet` + `SignJWT`:
  - valid token (iss, aud, `tid`, `oid`, `preferred_username: 'Ivan@Corp.com'`, exp +5m) → `{ kind: 'entra', oid, tenantId, email: 'ivan@corp.com' }`.
  - rejects: wrong `aud`; wrong `iss`; `tid` ≠ tenant (iss still correct); expired; missing `oid`; signed by another key; HS256 token signed with a secret.
- [x] **Step 2:** `npm test -w @tracker/api -- entra-token-verifier` → FAIL.
- [x] **Step 3:** Implement with `jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'] })`. `LocalTokenVerifier` wraps `tokens.verifyAccessToken`.
- [x] **Step 4:** Same → PASS. Commit `feat(api): local and Entra access token verifiers`.

### Task 3: External id, user resolver, middleware wiring

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`User.externalId String? @unique @map("external_id") @db.VarChar(64)`)
- Create: `apps/api/prisma/migrations/20261116120000_user_external_id/migration.sql`
- Create: `apps/api/src/modules/identity/application/auth-user-resolver.ts`
- Test: `apps/api/src/modules/identity/application/auth-user-resolver.spec.ts`
- Modify: `apps/api/src/shared/presentation/middleware/auth.middleware.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts`

**Interfaces:**
- Consumes: `VerifiedIdentity`, `ACCESS_TOKEN_VERIFIER`, `authProviderOf`.
- Produces: `export class AuthUserResolver { resolve(identity: VerifiedIdentity): Promise<AuthenticatedUser> }`. Throws `UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'Account is inactive' } })` for missing/inactive local user or inactive entra user; `ForbiddenException({ error: { code: 'USER_NOT_PROVISIONED', message: 'Учётная запись не добавлена в Roadmap. Обратитесь к администратору.' } })` for unknown entra user; DB-unavailable → `ServiceUnavailableException` with `DB_UNAVAILABLE` (moved from middleware). IdentityModule provides `ACCESS_TOKEN_VERIFIER` via factory on `AUTH_PROVIDER` and exports it with `AuthUserResolver`.

- [x] **Step 1: Failing tests** (Prisma mocked as `{ user: { findUnique, findFirst, update } }`):
  - local identity → user by id, `isAdmin` from `admin` role.
  - entra: found by `externalId` → returned, no update.
  - entra: not by `externalId`, found by email (`mode: 'insensitive'`) with `externalId: null` → `update` sets `externalId = oid`, returned.
  - entra: email match already linked to another oid → 403 `USER_NOT_PROVISIONED`, no update.
  - entra: email `null` or no match → 403.
  - entra: inactive → 401.
- [x] **Step 2:** `npm test -w @tracker/api -- auth-user-resolver` → FAIL.
- [x] **Step 3:** Schema + migration (`ALTER TABLE "users" ADD COLUMN "external_id" VARCHAR(64); CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");`), `npm run db:generate`, implement resolver, middleware = bearer parse → `verifier.verify` (catch → 401 `Invalid or expired access token`) → `resolver.resolve`.
- [x] **Step 4:** `npm test -w @tracker/api` → all PASS (incl. existing). `npm run build -w @tracker/api` → OK.
- [x] **Step 5:** Commit `feat(api): resolve users by Entra object id`.

### Task 4: `/auth/config` and disabling local endpoints in Entra mode

**Files:**
- Modify: `apps/api/src/modules/identity/presentation/auth.controller.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-auth-config.handler.ts`
- Test: `apps/api/src/modules/identity/application/queries/get-auth-config.handler.spec.ts`
- Modify: `apps/api/src/app.module.ts` (exclude `GET auth/config`)
- Modify: `packages/shared/src/` (export `AuthClientConfig` type, see below)

**Interfaces:**
- Produces: `export type AuthClientConfig = { provider: 'local' } | { provider: 'entra'; tenantId: string; clientId: string; scopes: string[] }` in `@tracker/shared`. `GetAuthConfigHandler.execute(): AuthClientConfig`; `GetAuthConfigHandler.assertLocal(): void` throws `NotFoundException({ error: { code: 'AUTH_PROVIDER_DISABLED', message: 'Вход по паролю отключён' } })` in entra mode. `login`/`refresh` call `assertLocal()` first.

- [x] **Step 1: Failing tests:** local env → `{ provider: 'local' }`; entra env → tenant, client, `scopes: ['api://x/access_as_user']` for audience `api://x`; explicit `ENTRA_API_SCOPE` wins; `assertLocal` throws in entra, not in local.
- [x] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run all API tests + build → PASS.
- [x] **Step 5:** Commit `feat(api): expose auth client config`.

### Task 5: Web auth provider abstraction (local implementation)

**Files:**
- Create: `apps/web/src/shared/lib/auth/types.ts`, `apps/web/src/shared/lib/auth/local-provider.ts`, `apps/web/src/shared/lib/auth/index.ts`
- Modify: `apps/web/src/shared/api/client.ts`, `apps/web/src/features/auth/model/useAuth.ts`, `apps/web/src/features/auth/ui/AuthGuard.tsx`, `apps/web/src/features/auth/ui/AdminGuard.tsx`, `apps/web/src/views/roadmap/model/use-roadmap-table-preferences.ts` (import path only), `apps/web/src/entities/user/api/authApi.ts` (add `config()`)

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export interface AuthProvider {
    readonly kind: 'local' | 'entra';
    getSessionId(): string | null;                       // sync, used by useSyncExternalStore
    getAccessToken(): Promise<string | null>;
    handleUnauthorized(sessionId: string, token: string): Promise<RefreshOutcome>;
    signOut(): Promise<void>;
  }
  ```
- Produces (`index.ts`): `loadAuthProvider(): Promise<AuthProvider>` (fetches `/auth/config` once with `skipAuth`, caches the promise, clears cache on failure so a retry is possible); `getSessionId(): string | null` (resolved provider's, or local storage's before resolution); re-export `AUTH_EXPIRED_EVENT`.
- `local-provider.ts` = existing `auth-storage` + `auth-session` functions, unchanged behaviour; those two files stay as its internals.
- `useAuth` returns additionally `provider: 'local' | 'entra' | null` and `configError: unknown`; `hasToken` comes from `(await loadAuthProvider()).getSessionId() !== null`. `logout` calls `provider.signOut()`.
- `AuthGuard`: if `configError` → text `Не удалось подключиться к серверу. Обновите страницу.`, no redirect.

- [x] **Step 1:** Implement (no unit runner covers React here; behaviour is pinned by the unchanged local flow).
- [x] **Step 2:** `npm run lint -w @tracker/web` and `npm run build -w @tracker/web` → OK.
- [x] **Step 3:** Run app in local mode, sign in as local admin, open roadmap, reload, sign out → identical to before; stop API → guard shows the connection error, no redirect loop.
- [x] **Step 4:** Commit `refactor(web): route auth through a provider abstraction`.

### Task 6: Entra (MSAL) web provider and login page

**Files:**
- Create: `apps/web/src/shared/lib/auth/entra-provider.ts`
- Modify: `apps/web/src/shared/lib/auth/index.ts`, `apps/web/src/views/login/ui/LoginPage.tsx`, `apps/web/src/features/auth/ui/AuthGuard.tsx`, `apps/web/package.json` (`@azure/msal-browser`, current major)

**Interfaces:**
- Consumes: `AuthProvider`, `AuthClientConfig`.
- Produces: `createEntraProvider(config: Extract<AuthClientConfig, { provider: 'entra' }>): Promise<EntraAuthProvider>`, where `EntraAuthProvider extends AuthProvider { signInRedirect(redirectTo: string): Promise<void> }`.
  - `createPublicClientApplication({ auth: { clientId, authority: 'https://login.microsoftonline.com/{tenantId}', redirectUri: origin + routes.login }, cache: { cacheLocation: 'sessionStorage' } })`, then `handleRedirectPromise()`; on result set active account and `router`-independent `window.location.replace(state)` when `state` is a safe path (`safeRedirectPath`).
  - `getSessionId()` = active account `homeAccountId` or `null`; `getAccessToken()` = `acquireTokenSilent({ scopes })`.accessToken, `InteractionRequiredAuthError` → `null`.
  - `handleUnauthorized` → `acquireTokenSilent({ scopes, forceRefresh: true })`: new token → `'refreshed'`; interaction required → clear active account, dispatch `AUTH_EXPIRED_EVENT`, `'rejected'`; network error → `'unavailable'`.
  - `signOut()` → `logoutRedirect({ postLogoutRedirectUri: origin + routes.login })`.
- `LoginPage`: `provider === 'entra'` → instead of the form, one button `Войти через Microsoft` calling `signInRedirect(redirectTo)`; `local` → current form unchanged.
- `AuthGuard`: `ApiError` with code `USER_NOT_PROVISIONED` → show its message instead of the generic session error.

- [x] **Step 1:** Install, implement.
- [x] **Step 2:** `npm run lint -w @tracker/web` and `npm run build -w @tracker/web` → OK.
- [x] **Step 3:** Local mode regression check from Task 5 Step 3 still holds.
- [x] **Step 4:** Note in `apps/web/.env.example` that the mode comes from the API's `AUTH_PROVIDER`. Commit `feat(web): Entra ID sign-in provider behind AUTH_PROVIDER`.
