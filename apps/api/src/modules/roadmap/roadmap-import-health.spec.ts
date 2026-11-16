import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import type { AzureDevOpsCredentials } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import {
  importWorkItemsRecorded,
  recordImportOutcome,
} from './roadmap-import-health';

type State = {
  projectId: string;
  importFailingSince: Date | null;
  lastImportError: string | null;
  lastImportFailedAt: Date | null;
  lastImportOkAt: Date | null;
  lastImportChangedAt: Date | null;
};

function setup() {
  const rows = new Map<string, State>();
  const empty = (projectId: string): State => ({
    projectId,
    importFailingSince: null,
    lastImportError: null,
    lastImportFailedAt: null,
    lastImportOkAt: null,
    lastImportChangedAt: null,
  });
  const roadmapAzureProjectState = {
    upsert: jest.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { projectId: string };
        create: Partial<State> & { projectId: string };
        update: Partial<State>;
      }) => {
        const current = rows.get(where.projectId);
        rows.set(
          where.projectId,
          current
            ? { ...current, ...update }
            : { ...empty(where.projectId), ...create },
        );
        return Promise.resolve();
      },
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { projectId: string; importFailingSince: null };
        data: Partial<State>;
      }) => {
        const current = rows.get(where.projectId);
        if (!current || current.importFailingSince !== null)
          return Promise.resolve({ count: 0 });
        rows.set(where.projectId, { ...current, ...data });
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  const prisma = { roadmapAzureProjectState } as unknown as PrismaService;
  return { rows, prisma };
}

const t0 = new Date('2026-11-16T09:00:00.000Z');
const minutesAfter = (minutes: number) =>
  new Date(t0.getTime() + minutes * 60_000);

describe('recordImportOutcome', () => {
  it('failure sets importFailingSince only when empty', async () => {
    const { rows, prisma } = setup();

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: false, error: new Error('Azure DevOps returned 500') },
      t0,
    );
    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: false, error: new Error('Azure DevOps returned 500') },
      minutesAfter(5),
    );

    const state = rows.get('project-1');
    expect(state?.importFailingSince).toEqual(t0);
    expect(state?.lastImportFailedAt).toEqual(minutesAfter(5));
  });

  it('keeps the earliest start when the row already exists without a series', async () => {
    const { rows, prisma } = setup();
    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: true, changed: false, source: 'poll' },
      t0,
    );

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: false, error: new Error('boom') },
      minutesAfter(1),
    );

    expect(rows.get('project-1')?.importFailingSince).toEqual(minutesAfter(1));
  });

  it('success clears the failure series', async () => {
    const { rows, prisma } = setup();
    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: false, error: new Error('boom') },
      t0,
    );

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: true, changed: false, source: 'poll' },
      minutesAfter(10),
    );

    const state = rows.get('project-1');
    expect(state?.importFailingSince).toBeNull();
    expect(state?.lastImportOkAt).toEqual(minutesAfter(10));
    expect(state?.lastImportChangedAt).toBeNull();
  });

  it('poll with changes stamps lastImportChangedAt, webhook does not', async () => {
    const { rows, prisma } = setup();

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: true, changed: true, source: 'poll' },
      t0,
    );
    expect(rows.get('project-1')?.lastImportChangedAt).toEqual(t0);

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: true, changed: true, source: 'webhook' },
      minutesAfter(5),
    );
    const state = rows.get('project-1');
    expect(state?.lastImportChangedAt).toEqual(t0);
    expect(state?.lastImportOkAt).toEqual(minutesAfter(5));
  });

  it('poll without changes leaves lastImportChangedAt unchanged', async () => {
    const { rows, prisma } = setup();
    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: true, changed: true, source: 'poll' },
      t0,
    );

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: true, changed: false, source: 'poll' },
      minutesAfter(5),
    );

    expect(rows.get('project-1')?.lastImportChangedAt).toEqual(t0);
  });

  it('failure text is redacted and truncated', async () => {
    const { rows, prisma } = setup();

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: false, error: new Error('Basic abc123 failed ' + 'x'.repeat(600)) },
      t0,
    );

    const stored = rows.get('project-1')?.lastImportError ?? '';
    expect(stored).not.toContain('abc123');
    expect(stored.length).toBeLessThanOrEqual(500);
    expect(stored).toContain('failed');
  });

  it('records non-Error failures without throwing', async () => {
    const { rows, prisma } = setup();

    await recordImportOutcome(
      prisma,
      'project-1',
      { ok: false, error: 'oops' },
      t0,
    );
    await recordImportOutcome(
      prisma,
      'project-2',
      { ok: false, error: { code: 1 } },
      t0,
    );

    expect(rows.get('project-1')?.lastImportError).toBe('oops');
    expect(rows.get('project-2')?.lastImportError).toBeTruthy();
  });

  it('never throws when the health write itself fails', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const prisma = {
      roadmapAzureProjectState: {
        upsert: jest.fn().mockRejectedValue(new Error('db down')),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(
      recordImportOutcome(
        prisma,
        'project-1',
        { ok: false, error: new Error('x') },
        t0,
      ),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('importWorkItemsRecorded', () => {
  const credentials = {
    organizationUrl: 'https://x',
  } as AzureDevOpsCredentials;

  it('returns the imported items and records a success that is not a poll', async () => {
    const { rows, prisma } = setup();
    const importWorkItems = jest.fn().mockResolvedValue([{ id: 7 }]);
    const importer = {
      importWorkItems,
    } as unknown as RoadmapWorkItemImportService;

    await expect(
      importWorkItemsRecorded(prisma, importer, 'project-1', [7], credentials),
    ).resolves.toEqual([{ id: 7 }]);

    expect(importWorkItems).toHaveBeenCalledWith(
      { id: 'project-1' },
      [7],
      credentials,
    );
    const state = rows.get('project-1');
    expect(state?.lastImportOkAt).toBeInstanceOf(Date);
    expect(state?.lastImportChangedAt).toBeNull();
  });

  it('records the failure and rethrows the original error', async () => {
    const { rows, prisma } = setup();
    const failure = new Error('Azure DevOps returned 503');
    const importer = {
      importWorkItems: jest.fn().mockRejectedValue(failure),
    } as unknown as RoadmapWorkItemImportService;

    await expect(
      importWorkItemsRecorded(prisma, importer, 'project-1', [7], credentials),
    ).rejects.toBe(failure);

    const state = rows.get('project-1');
    expect(state?.importFailingSince).toBeInstanceOf(Date);
    expect(state?.lastImportError).toBe('Azure DevOps returned 503');
  });
});
