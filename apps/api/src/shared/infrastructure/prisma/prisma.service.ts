import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const CONNECTIVITY_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

/** True when a Prisma error means the database could not be reached, not that a query was wrong. */
export function isDatabaseUnavailable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      CONNECTIVITY_ERROR_CODES.has(error.code))
  );
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /** The API starts without a database; Prisma reconnects lazily on the first query. */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        'PostgreSQL unavailable — API starts in degraded mode. See README.md',
      );
      this.logger.debug(error);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
