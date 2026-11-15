import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';

const credentials = { pat: 'pat' };
const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? '{}' : 'failure', { status, headers });

describe('Azure DevOps requests', () => {
  const service = new RoadmapIntegrationService(
    {} as ConfigService,
    {} as PrismaService,
  );
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('applies a default timeout and keeps a caller-provided signal', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(200)));
    const own = new AbortController().signal;

    await service.request(
      'https://dev.azure.com/org/_apis/projects',
      undefined,
      credentials,
    );
    await service.request(
      'https://dev.azure.com/org/_apis/projects',
      { signal: own },
      credentials,
    );

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal).toBe(own);
  });

  it('retries a throttled write because Azure did not process it', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(reply(200));

    const response = await service.request(
      'https://dev.azure.com/org/x',
      { method: 'POST', body: '{}' },
      credentials,
    );

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries gateway errors for GET only', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200));
    await expect(
      service.request('https://dev.azure.com/org/x', undefined, credentials),
    ).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset().mockImplementation(() => Promise.resolve(reply(503)));
    await expect(
      service.request(
        'https://dev.azure.com/org/x',
        { method: 'POST', body: '{}' },
        credentials,
      ),
    ).rejects.toBeInstanceOf(AzureDevOpsHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry limit', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(reply(429, { 'retry-after': '0' })),
    );

    await expect(
      service.request('https://dev.azure.com/org/x', undefined, credentials),
    ).rejects.toMatchObject({
      httpStatus: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
