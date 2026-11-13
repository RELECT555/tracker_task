import { validateAuthConfig } from './auth-config';

describe('Authentication configuration', () => {
  it('keeps dev mode as the local default', () => {
    expect(validateAuthConfig({}).AUTH_MODE).toBe('dev');
  });

  it('rejects unknown modes and dev mode in production', () => {
    expect(() => validateAuthConfig({ AUTH_MODE: 'strcit' })).toThrow(
      'AUTH_MODE',
    );
    expect(() =>
      validateAuthConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev' }),
    ).toThrow('AUTH_MODE');
  });

  it.each([
    undefined,
    'dev-only-change-me',
    'generate-strong-random-secret-min-32-chars',
  ])('rejects an unsafe strict-mode secret (%s)', (secret) => {
    expect(() =>
      validateAuthConfig({ AUTH_MODE: 'strict', JWT_SECRET: secret }),
    ).toThrow('JWT_SECRET');
  });

  it('defaults production to strict with a configured secret', () => {
    expect(
      validateAuthConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'strict-test-secret-'.repeat(3),
      }).AUTH_MODE,
    ).toBe('strict');
  });
});
