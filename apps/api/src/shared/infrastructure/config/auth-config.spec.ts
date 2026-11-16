import { authProviderOf, validateAuthConfig } from './auth-config';

describe('Authentication configuration', () => {
  const jwtSecret = 'strict-test-secret-'.repeat(3);
  const password = 'local-admin-test-password';

  it.each([
    undefined,
    'dev-only-change-me',
    'generate-strong-random-secret-min-32-chars',
  ])('rejects an unsafe JWT secret in local development (%s)', (secret) => {
    expect(() =>
      validateAuthConfig({
        JWT_SECRET: secret,
        LOCAL_ADMIN_PASSWORD: password,
      }),
    ).toThrow('JWT_SECRET');
  });

  it.each([undefined, '', 'tracker'])(
    'rejects missing or legacy admin credentials (%s)',
    (configuredPassword) => {
      expect(() =>
        validateAuthConfig({
          JWT_SECRET: jwtSecret,
          LOCAL_ADMIN_PASSWORD: configuredPassword,
        }),
      ).toThrow('LOCAL_ADMIN_PASSWORD');
    },
  );

  it('keeps the configured password unchanged', () => {
    expect(
      validateAuthConfig({
        JWT_SECRET: jwtSecret,
        LOCAL_ADMIN_PASSWORD: ` ${password} `,
      }).LOCAL_ADMIN_PASSWORD,
    ).toBe(` ${password} `);
  });

  it('accepts a shorter password in local development', () => {
    expect(
      validateAuthConfig({
        NODE_ENV: 'development',
        JWT_SECRET: jwtSecret,
        LOCAL_ADMIN_PASSWORD: 'roadmap',
      }).LOCAL_ADMIN_PASSWORD,
    ).toBe('roadmap');
  });

  it.each(['development', 'production'])(
    'rejects a whitespace-only password in %s',
    (mode) => {
      expect(() =>
        validateAuthConfig({
          NODE_ENV: mode,
          JWT_SECRET: jwtSecret,
          LOCAL_ADMIN_PASSWORD: '   ',
        }),
      ).toThrow('LOCAL_ADMIN_PASSWORD');
    },
  );

  it('rejects a short password in production', () => {
    expect(() =>
      validateAuthConfig({
        NODE_ENV: 'production',
        JWT_SECRET: jwtSecret,
        LOCAL_ADMIN_PASSWORD: 'roadmap',
      }),
    ).toThrow('LOCAL_ADMIN_PASSWORD');
  });
});

describe('Auth provider selection', () => {
  const jwtSecret = 'strict-test-secret-'.repeat(3);
  const entra = {
    AUTH_PROVIDER: 'entra',
    JWT_SECRET: jwtSecret,
    ENTRA_TENANT_ID: '11111111-2222-4333-8444-555555555555',
    ENTRA_CLIENT_ID: '66666666-7777-4888-9999-000000000000',
    ENTRA_API_AUDIENCE: 'api://tracker-roadmap',
  };

  it('defaults to the local provider', () => {
    expect(authProviderOf({})).toBe('local');
    expect(authProviderOf({ AUTH_PROVIDER: '' })).toBe('local');
  });

  it('reads the provider case-insensitively', () => {
    expect(authProviderOf({ AUTH_PROVIDER: 'ENTRA' })).toBe('entra');
  });

  it('rejects an unknown provider', () => {
    expect(() => authProviderOf({ AUTH_PROVIDER: 'okta' })).toThrow(
      'AUTH_PROVIDER',
    );
  });

  it('does not require the local admin password in entra mode', () => {
    expect(validateAuthConfig(entra).AUTH_PROVIDER).toBe('entra');
  });

  it.each(['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_API_AUDIENCE'])(
    'requires %s in entra mode',
    (name) => {
      expect(() => validateAuthConfig({ ...entra, [name]: undefined })).toThrow(
        name,
      );
    },
  );

  it('requires a tenant GUID in entra mode', () => {
    expect(() =>
      validateAuthConfig({ ...entra, ENTRA_TENANT_ID: 'contoso' }),
    ).toThrow('ENTRA_TENANT_ID');
  });

  it('still requires JWT_SECRET in entra mode', () => {
    expect(() =>
      validateAuthConfig({ ...entra, JWT_SECRET: undefined }),
    ).toThrow('JWT_SECRET');
  });
});
