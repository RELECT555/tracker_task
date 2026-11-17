import { PrismaPg } from '@prisma/adapter-pg';

/** Query parameters that only the Prisma engine understood; node-postgres must not see them. */
const PRISMA_ONLY_PARAMS = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'pgbouncer',
];

/**
 * Prisma 7 talks to PostgreSQL through a driver adapter. The DATABASE_URL format stays the
 * same as before (`?schema=public&sslmode=require`), so existing deployments keep working:
 * the Prisma-specific parameters are translated into adapter options here.
 */
export function createPrismaAdapter(
  databaseUrl: string = process.env.DATABASE_URL ?? '',
  onPoolError?: (error: Error) => void,
): PrismaPg {
  let connectionString = databaseUrl;
  let schema: string | undefined;
  let max: number | undefined;

  try {
    const url = new URL(databaseUrl);
    schema = url.searchParams.get('schema') || undefined;
    const limit = Number(url.searchParams.get('connection_limit'));
    if (Number.isInteger(limit) && limit > 0) max = limit;
    for (const param of PRISMA_ONLY_PARAMS) url.searchParams.delete(param);
    connectionString = url.toString();
  } catch {
    // An unparsable or empty URL is passed through: the first query reports the connection error.
  }

  return new PrismaPg(
    { connectionString, ...(max ? { max } : {}) },
    { schema, onPoolError },
  );
}
