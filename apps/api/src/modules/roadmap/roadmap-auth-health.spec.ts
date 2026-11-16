import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapIntegrationService } from './roadmap-integration.service';

const HEALTH_KEY = 'roadmap.integration.health';
const credentials = { pat: 'pat' };
const url = 'https://dev.azure.com/org/_apis/projects';
const reply = (status: number) =>
  new Response(status === 200 ? '{}' : 'failure', { status });

describe('Azure auth health', () => {
  let store: Map<string, unknown>;
  let upsert: jest.Mock;
  let fetchMock: jest.SpyInstance;
  let config: Record<string, string>;

  const build = () =>
    new RoadmapIntegrationService(
      { get: (key: string) => config[key] } as unknown as ConfigService,
      {
        systemSetting: {
          findUnique: jest.fn(({ where }: { where: { key: string } }) =>
            Promise.resolve(
              store.has(where.key)
                ? { key: where.key, value: store.get(where.key) }
                : null,
            ),
          ),
          upsert,
        },
      } as unknown as PrismaService,
    );

  const healthWrites = () =>
    upsert.mock.calls
      .map(
        ([args]) => args as { where: { key: string }; update: { value: any } },
      )
      .filter((args) => args.where.key === HEALTH_KEY)
      .map((args) => args.update.value);

  beforeEach(() => {
    store = new Map();
    config = {};
    upsert = jest.fn(
      ({
        where,
        update,
      }: {
        where: { key: string };
        update: { value: unknown };
      }) => {
        store.set(where.key, update.value);
        return Promise.resolve();
      },
    );
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records a rejected PAT once across repeated 401 answers', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(401)));
    const service = build();

    for (let i = 0; i < 3; i += 1) {
      await expect(
        service.request(url, undefined, credentials),
      ).rejects.toMatchObject({ httpStatus: 401 });
    }

    const writes = healthWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ httpStatus: 401 });
    expect(typeof writes[0].authFailedAt).toBe('string');
    await expect(service.getAuthHealth()).resolves.toMatchObject({
      authFailedAt: expect.any(Date),
      httpStatus: 401,
    });
  });

  it('records recovery once after the PAT works again', async () => {
    const service = build();
    fetchMock.mockImplementation(() => Promise.resolve(reply(401)));
    await expect(
      service.request(url, undefined, credentials),
    ).rejects.toThrow();

    fetchMock.mockImplementation(() => Promise.resolve(reply(200)));
    await service.request(url, undefined, credentials);
    await service.request(url, undefined, credentials);

    const writes = healthWrites();
    expect(writes).toHaveLength(2);
    expect(typeof writes[1].authOkAt).toBe('string');
    expect(typeof writes[1].authFailedAt).toBe('string');
    const health = await service.getAuthHealth();
    expect(health.authOkAt).toBeInstanceOf(Date);
    expect(health.authFailedAt).toBeInstanceOf(Date);
    expect(health.authOkAt!.getTime()).toBeGreaterThanOrEqual(
      health.authFailedAt!.getTime(),
    );
  });

  it('records the first success once and never marks a working PAT as failed', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(200)));
    const service = build();

    await service.request(url, undefined, credentials);
    await service.request(url, undefined, credentials);

    expect(healthWrites()).toHaveLength(1);
    await expect(service.getAuthHealth()).resolves.toMatchObject({
      authFailedAt: null,
      authOkAt: expect.any(Date),
      httpStatus: null,
    });
  });

  it('writes a state change once even when requests overlap', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(401)));
    const service = build();

    await Promise.allSettled(
      [1, 2, 3].map(() => service.request(url, undefined, credentials)),
    );

    expect(healthWrites()).toHaveLength(1);
  });

  it('treats 403 as a permission problem, not a dead PAT', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(403)));
    const service = build();

    await expect(
      service.request(url, undefined, credentials),
    ).rejects.toMatchObject({ httpStatus: 403 });

    expect(healthWrites()).toHaveLength(0);
  });

  it('records an undecryptable PAT and still throws', async () => {
    config = {
      JWT_SECRET: 'a-secret',
      AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/org',
    };
    store.set('roadmap.integration.azure-devops', {
      organizationUrl: 'https://dev.azure.com/org',
      encryptedPat: {
        iv: 'AAAAAAAAAAAAAAAA',
        authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
        cipherText: 'AAAA',
      },
    });
    const service = build();

    await expect(service.getCredentials()).rejects.toThrow(/decrypt/);

    const writes = healthWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ httpStatus: null });
    expect(typeof writes[0].authFailedAt).toBe('string');
  });

  it('does not break the Azure request when health cannot be saved', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(200)));
    upsert.mockRejectedValue(new Error('db down'));
    const service = build();
    const logged = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await expect(
      service.request(url, undefined, credentials),
    ).resolves.toBeDefined();
    expect(logged).toHaveBeenCalled();
  });

  it('does not touch health when testing a connection', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(401)));
    const service = build();

    await expect(
      service.testConnection({
        organizationUrl: 'https://dev.azure.com/org',
        pat: 'typed-but-unsaved',
      }),
    ).rejects.toThrow();

    expect(upsert).not.toHaveBeenCalled();
  });
});
