import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_ROADMAP_TABLE_PREFERENCES,
  roadmapTablePreferencesSchema,
} from '@tracker/shared';
import type { AuthenticatedUser } from '../../shared/presentation/decorators/current-user.decorator';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapTablePreferencesController } from './roadmap-table-preferences.controller';
import { RoadmapTablePreferencesService } from './roadmap-table-preferences.service';

function setup() {
  const stored = new Map<string, unknown>();
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          roadmapTablePreferences: stored.get(where.id) ?? null,
        }),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { roadmapTablePreferences: unknown };
        }) => {
          stored.set(where.id, data.roadmapTablePreferences);
          return Promise.resolve({ id: where.id });
        },
      ),
    },
  };
  const service = new RoadmapTablePreferencesService(
    prisma as unknown as PrismaService,
  );
  return {
    stored,
    prisma,
    service,
    controller: new RoadmapTablePreferencesController(service),
  };
}

const viewer: AuthenticatedUser = {
  id: 'viewer-id',
  email: 'viewer@example.test',
  isAdmin: false,
};

describe('Personal roadmap table preferences', () => {
  it('returns null until the account has saved a preference snapshot', async () => {
    const { service } = setup();
    await expect(service.get('new-user')).resolves.toEqual({
      preferences: null,
    });
  });

  it('saves for a viewer using only their authenticated account and keeps other accounts isolated', async () => {
    const { service, controller, prisma } = setup();
    const preferences = {
      ...DEFAULT_ROADMAP_TABLE_PREFERENCES,
      density: 'compact' as const,
      columnWidths: { name: 580 },
    };
    await expect(controller.save(viewer, preferences)).resolves.toEqual({
      preferences,
    });
    await expect(controller.get(viewer)).resolves.toEqual({ preferences });
    await expect(service.get('other-user')).resolves.toEqual({
      preferences: null,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: viewer.id },
      data: { roadmapTablePreferences: preferences },
      select: { id: true },
    });
  });

  it('replaces all customized values with the baseline including widths', async () => {
    const { service } = setup();
    await service.save(viewer.id, {
      ...DEFAULT_ROADMAP_TABLE_PREFERENCES,
      headerTint: '#123456',
      showFact: false,
      pinnedColumns: 'totals',
      columnWidths: { name: 620 },
    });
    await service.save(viewer.id, DEFAULT_ROADMAP_TABLE_PREFERENCES);
    await expect(service.get(viewer.id)).resolves.toEqual({
      preferences: DEFAULT_ROADMAP_TABLE_PREFERENCES,
    });
  });

  it.each([
    { userId: 'another-user' },
    { projectId: 'project-specific' },
    { version: 2 },
    { density: 'unbounded' },
    { headerTint: 'url(https://example.test)' },
    { epicTint: '#fff' },
    { showFact: 'false' },
    { columnWidths: { name: Infinity } },
    { columnWidths: { name: 0 } },
    { columnWidths: { name: 2401 } },
    { columnWidths: { ['a'.repeat(161)]: 120 } },
    { columnWidths: JSON.parse('{"__proto__":120}') as unknown },
    {
      columnWidths: Object.fromEntries(
        Array.from({ length: 501 }, (_, i) => [`column:${i}`, 120]),
      ),
    },
  ])(
    'rejects malformed and foreign-account payloads without writing: %p',
    async (change) => {
      const { service, prisma } = setup();
      await expect(
        service.save(viewer.id, {
          ...DEFAULT_ROADMAP_TABLE_PREFERENCES,
          ...change,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );

  it('accepts the baseline as a complete versioned snapshot and rejects incomplete snapshots', () => {
    expect(
      roadmapTablePreferencesSchema.safeParse(DEFAULT_ROADMAP_TABLE_PREFERENCES)
        .success,
    ).toBe(true);
    expect(
      roadmapTablePreferencesSchema.safeParse({ version: 1 }).success,
    ).toBe(false);
  });

  it('does not expose invalid persisted JSON as usable appearance settings', async () => {
    const { service, stored } = setup();
    stored.set(viewer.id, { version: 99, unexpected: 'data' });
    await expect(service.get(viewer.id)).resolves.toEqual({
      preferences: null,
    });
  });
});
