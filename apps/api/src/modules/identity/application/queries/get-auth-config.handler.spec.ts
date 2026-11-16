import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GetAuthConfigHandler } from './get-auth-config.handler';

const entraEnv = {
  AUTH_PROVIDER: 'entra',
  ENTRA_TENANT_ID: '11111111-2222-4333-8444-555555555555',
  ENTRA_CLIENT_ID: '66666666-7777-4888-9999-000000000000',
  ENTRA_API_AUDIENCE: 'api://x',
};

const handlerFor = (env: Record<string, string>) =>
  new GetAuthConfigHandler({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

describe('GetAuthConfigHandler', () => {
  it('reports the local provider by default', () => {
    expect(handlerFor({}).execute()).toEqual({ provider: 'local' });
  });

  it('reports the Entra client settings with the default API scope', () => {
    expect(handlerFor(entraEnv).execute()).toEqual({
      provider: 'entra',
      tenantId: entraEnv.ENTRA_TENANT_ID,
      clientId: entraEnv.ENTRA_CLIENT_ID,
      scopes: ['api://x/access_as_user'],
    });
  });

  it('uses an explicit API scope when configured', () => {
    expect(
      handlerFor({
        ...entraEnv,
        ENTRA_API_SCOPE: 'api://x/Roadmap.Read',
      }).execute(),
    ).toMatchObject({ scopes: ['api://x/Roadmap.Read'] });
  });

  it('disables password sign-in in Entra mode', () => {
    expect(() => handlerFor(entraEnv).assertLocal()).toThrow(NotFoundException);
    expect(() => handlerFor({}).assertLocal()).not.toThrow();
  });
});
