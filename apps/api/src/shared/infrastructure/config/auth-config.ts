const productionPlaceholder = 'generate-strong-random-secret-min-32-chars';
const guid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthProviderKind = 'local' | 'entra';

export function authProviderOf(env: Record<string, unknown>): AuthProviderKind {
  const raw = env.AUTH_PROVIDER;
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === '' || value === 'local') return 'local';
  if (value === 'entra') return 'entra';
  throw new Error('AUTH_PROVIDER must be local or entra');
}

export function validateAuthConfig(env: Record<string, unknown>) {
  const provider = authProviderOf(env);

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

  if (provider === 'entra') {
    validateEntraConfig(env);
    return { ...env, AUTH_PROVIDER: provider };
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

function validateEntraConfig(env: Record<string, unknown>): void {
  for (const name of [
    'ENTRA_TENANT_ID',
    'ENTRA_CLIENT_ID',
    'ENTRA_API_AUDIENCE',
  ]) {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`AUTH_PROVIDER=entra requires ${name}`);
    }
  }
  if (!guid.test(String(env.ENTRA_TENANT_ID).trim())) {
    throw new Error('ENTRA_TENANT_ID must be the directory (tenant) GUID');
  }
}
