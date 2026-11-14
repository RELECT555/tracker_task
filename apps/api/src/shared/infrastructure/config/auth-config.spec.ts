import { validateAuthConfig } from './auth-config';

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
