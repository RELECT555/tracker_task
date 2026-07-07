import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  get isConnected(): boolean {
    return this.connected;
  }

  async onModuleInit(): Promise<void> {
    await this.tryConnect();
  }

  async tryConnect(): Promise<boolean> {
    try {
      await this.$connect();
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false;
      this.logger.warn(
        'PostgreSQL unavailable — API starts in degraded mode. See docs/12-database-and-environments.md',
      );
      this.logger.debug(error);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.connected) {
      await this.tryConnect();
    }
    if (!this.connected) return false;

    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.$disconnect();
    }
  }
}
