import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { HealthController } from './health.controller';

function controllerWithDb(ping: jest.Mock): HealthController {
  return new HealthController({ ping } as unknown as PrismaService);
}

describe('HealthController', () => {
  it('liveness does not touch the database', () => {
    const ping = jest.fn();

    expect(controllerWithDb(ping).check()).toMatchObject({
      status: 'ok',
      service: 'tracker-api',
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it('readiness is ok while the database answers', async () => {
    const ping = jest.fn().mockResolvedValue(true);

    await expect(controllerWithDb(ping).ready()).resolves.toMatchObject({
      status: 'ok',
      db: true,
    });
  });

  it('readiness answers 503 when the database is down', async () => {
    const ping = jest.fn().mockResolvedValue(false);

    const error = await controllerWithDb(ping)
      .ready()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      status: 'degraded',
      db: false,
    });
  });
});
