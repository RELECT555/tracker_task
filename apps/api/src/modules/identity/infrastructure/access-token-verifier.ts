import { TokenService } from './token.service';

/** Who an access token belongs to, before we look the user up in our database. */
export type VerifiedIdentity =
  | { kind: 'local'; userId: string }
  | { kind: 'entra'; oid: string; tenantId: string; email: string | null };

export interface AccessTokenVerifier {
  /** Resolves the token's identity or rejects when the token must not be accepted. */
  verify(token: string): Promise<VerifiedIdentity>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

export class LocalTokenVerifier implements AccessTokenVerifier {
  constructor(private readonly tokens: TokenService) {}

  verify(token: string): Promise<VerifiedIdentity> {
    return Promise.resolve().then(() => ({
      kind: 'local' as const,
      userId: this.tokens.verifyAccessToken(token),
    }));
  }
}
