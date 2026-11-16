import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapRolesService } from './roadmap-roles.service';

function setup(deleted: number) {
  const deleteMany = jest.fn().mockResolvedValue({ count: deleted });
  const service = new RoadmapRolesService({
    roadmapRole: { deleteMany },
  } as unknown as PrismaService);
  return { service, deleteMany };
}

describe('Role catalog deletion', () => {
  it('deletes only catalog roles, never roles assigned to a project', async () => {
    const { service, deleteMany } = setup(1);
    await expect(service.deleteRoleTemplate('template')).resolves.toEqual({
      deleted: true,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'template', projectId: null },
    });
  });

  it('reports a missing catalog role', async () => {
    const { service } = setup(0);
    await expect(service.deleteRoleTemplate('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
