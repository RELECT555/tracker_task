const productionPlaceholder = 'generate-strong-random-secret-min-32-chars';

export function validateAuthConfig(env: Record<string, unknown>) {
  const secret = env.JWT_SECRET;
  if (
    typeof secret !== 'string' ||
    secret.trim().length < 32 ||
    secret.trim() === productionPlaceholder
  ) {
    throw new Error(
      'Authentication requires a JWT_SECRET of at least 32 characters',
    );
  }

  const password = env.LOCAL_ADMIN_PASSWORD;
  const minPasswordLength = env.NODE_ENV === 'development' ? 7 : 12;
  if (
    typeof password !== 'string' ||
    password.trim().length < minPasswordLength
  ) {
    throw new Error(
      `Set LOCAL_ADMIN_PASSWORD to a private password of at least ${minPasswordLength} characters`,
    );
  }

  return env;
}
