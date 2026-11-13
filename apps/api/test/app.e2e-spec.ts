import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication;
  const ping = jest.fn();

  beforeEach(async () => {
    ping.mockResolvedValue(true);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ ping })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('tracker-api');
      });
  });

  it('reports readiness only while the database responds', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'ok', db: true }),
      );

    ping.mockResolvedValue(false);
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'degraded', db: false }),
      );
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
