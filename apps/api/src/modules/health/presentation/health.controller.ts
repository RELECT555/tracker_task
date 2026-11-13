import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'tracker-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    const db = await this.prisma.ping();
    const result = {
      status: db ? 'ok' : 'degraded',
      db,
      timestamp: new Date().toISOString(),
    };
    if (!db) throw new ServiceUnavailableException(result);
    return result;
  }
}
