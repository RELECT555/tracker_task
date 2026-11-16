import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type {
  AccessTokenVerifier,
  VerifiedIdentity,
} from './access-token-verifier';

export interface EntraTokenVerifierOptions {
  tenantId: string;
  audience: string;
  /** Signing keys; defaults to the tenant's published JWKS. */
  keys?: JWTVerifyGetKey;
}

const emailClaims = ['preferred_username', 'email', 'upn'] as const;

/** Verifies Microsoft Entra ID (v2.0) access tokens issued for this API. */
export class EntraTokenVerifier implements AccessTokenVerifier {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(private readonly options: EntraTokenVerifierOptions) {
    const authority = `https://login.microsoftonline.com/${options.tenantId}`;
    this.issuer = `${authority}/v2.0`;
    this.keys =
      options.keys ??
      createRemoteJWKSet(new URL(`${authority}/discovery/v2.0/keys`));
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.issuer,
      audience: this.options.audience,
      algorithms: ['RS256'],
    });
    if (payload.tid !== this.options.tenantId) {
      throw new Error('Token was issued for another tenant');
    }
    if (typeof payload.oid !== 'string' || payload.oid === '') {
      throw new Error('Token has no object id');
    }
    const email = emailClaims
      .map((claim) => payload[claim])
      .find(
        (value): value is string => typeof value === 'string' && value !== '',
      );
    return {
      kind: 'entra',
      oid: payload.oid,
      tenantId: payload.tid,
      email: email?.trim().toLowerCase() ?? null,
    };
  }
}
