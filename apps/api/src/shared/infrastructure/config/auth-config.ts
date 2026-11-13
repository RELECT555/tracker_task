export type AuthMode = 'dev' | 'strict';

const productionPlaceholder = 'generate-strong-random-secret-min-32-chars';

export function validateAuthConfig(env: Record<string, unknown>) {
  const production = env.NODE_ENV === 'production';
  const mode = env.AUTH_MODE ?? (production ? 'strict' : 'dev');
  if (mode !== 'dev' && mode !== 'strict') {
    throw new Error('AUTH_MODE must be dev or strict');
  }
  if (production && mode !== 'strict') {
    throw new Error('AUTH_MODE must be strict in production');
  }

  const secret = env.JWT_SECRET;
  if (
    mode === 'strict' &&
    (typeof secret !== 'string' ||
      secret.trim().length < 32 ||
      secret.trim() === productionPlaceholder)
  ) {
    throw new Error(
      'Strict authentication requires a JWT_SECRET of at least 32 characters',
    );
  }

  return { ...env, AUTH_MODE: mode };
}
