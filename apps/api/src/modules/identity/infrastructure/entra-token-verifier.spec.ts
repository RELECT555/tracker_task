import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import { EntraTokenVerifier } from './entra-token-verifier';

const tenantId = '11111111-2222-4333-8444-555555555555';
const otherTenant = '99999999-2222-4333-8444-555555555555';
const audience = 'api://tracker-roadmap';
const oid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

describe('EntraTokenVerifier', () => {
  let signingKey: KeyLike;
  let verifier: EntraTokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    signingKey = pair.privateKey;
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'k1',
      alg: 'RS256',
    };
    verifier = new EntraTokenVerifier({
      tenantId,
      audience,
      keys: createLocalJWKSet({ keys: [jwk] }),
    });
  });

  const sign = (
    claims: JWTPayload,
    options: { key?: KeyLike; exp?: string; iss?: string; aud?: string } = {},
  ) =>
    new SignJWT({ tid: tenantId, oid, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(options.iss ?? issuer)
      .setAudience(options.aud ?? audience)
      .setIssuedAt()
      .setExpirationTime(options.exp ?? '5m')
      .sign(options.key ?? signingKey);

  it('returns the Entra identity of a valid token', async () => {
    const token = await sign({ preferred_username: 'Ivan@Corp.com' });
    await expect(verifier.verify(token)).resolves.toEqual({
      kind: 'entra',
      oid,
      tenantId,
      email: 'ivan@corp.com',
    });
  });

  it('falls back to the upn claim and allows a missing email', async () => {
    await expect(
      verifier.verify(await sign({ upn: 'User@Corp.com' })),
    ).resolves.toMatchObject({ email: 'user@corp.com' });
    await expect(verifier.verify(await sign({}))).resolves.toMatchObject({
      email: null,
    });
  });

  it('rejects a token for another audience', async () => {
    await expect(
      verifier.verify(await sign({}, { aud: 'api://other' })),
    ).rejects.toThrow();
  });

  it('rejects a token from another issuer', async () => {
    const iss = `https://login.microsoftonline.com/${otherTenant}/v2.0`;
    await expect(verifier.verify(await sign({}, { iss }))).rejects.toThrow();
  });

  it('rejects a token whose tenant claim differs', async () => {
    await expect(
      verifier.verify(await sign({ tid: otherTenant })),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    await expect(
      verifier.verify(await sign({}, { exp: '-1m' })),
    ).rejects.toThrow();
  });

  it('rejects a token without an object id', async () => {
    await expect(
      verifier.verify(await sign({ oid: undefined })),
    ).rejects.toThrow();
  });

  it('rejects a token signed by an unknown key', async () => {
    const other = await generateKeyPair('RS256');
    await expect(
      verifier.verify(await sign({}, { key: other.privateKey })),
    ).rejects.toThrow();
  });

  it('rejects a locally issued HS256 token', async () => {
    const secret = new TextEncoder().encode('strict-test-secret-'.repeat(3));
    const token = await new SignJWT({ sub: oid, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('tracker-roadmap')
      .setExpirationTime('5m')
      .sign(secret);
    await expect(verifier.verify(token)).rejects.toThrow();
  });
});
