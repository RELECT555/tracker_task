import { BadGatewayException } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapPeopleService } from './roadmap-people.service';

function setup(pages: { value?: unknown[]; token?: string }[]) {
  const prisma = {
    $transaction: jest.fn().mockResolvedValue([]),
    roadmapPerson: { upsert: jest.fn(), updateMany: jest.fn() },
    roadmapRole: { updateMany: jest.fn() },
  };
  const request = jest.fn();
  for (const page of pages) {
    request.mockResolvedValueOnce({
      json: () => Promise.resolve({ value: page.value }),
      headers: { get: () => page.token ?? null },
    });
  }
  const service = new RoadmapPeopleService(
    prisma as unknown as PrismaService,
    {
      getCredentials: jest
        .fn()
        .mockResolvedValue({ organization: 'org', pat: 'pat' }),
      request,
    } as unknown as RoadmapIntegrationService,
  );
  return { service, prisma, request };
}

const human = (descriptor: string) => ({
  descriptor,
  subjectKind: 'user',
  displayName: `Person ${descriptor}`,
  mailAddress: `${descriptor}@example.com`,
});

describe('Azure DevOps people synchronization', () => {
  it('keeps the existing people when Azure returns an empty list', async () => {
    const { service, prisma } = setup([{ value: [] }]);

    await expect(service.syncAzurePeople()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the existing people when no returned profile is an eligible human', async () => {
    const { service, prisma } = setup([
      {
        value: [
          {
            descriptor: 'svc',
            subjectKind: 'user',
            displayName: 'Build Service (org)',
            principalName: 'svc@org',
          },
        ],
      },
    ]);

    await expect(service.syncAzurePeople()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stops when Azure repeats a continuation token', async () => {
    const { service, prisma } = setup([
      { value: [human('a')], token: 'same' },
      { value: [human('b')], token: 'same' },
    ]);

    await expect(service.syncAzurePeople()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('upserts eligible people and deactivates the rest', async () => {
    const { service, prisma } = setup([{ value: [human('a'), human('b')] }]);

    await expect(service.syncAzurePeople()).resolves.toEqual({
      synced: 2,
      ignored: 0,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.roadmapPerson.upsert).toHaveBeenCalledTimes(2);
  });
});
