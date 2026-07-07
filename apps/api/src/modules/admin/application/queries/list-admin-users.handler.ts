import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ListAdminUsersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const users = await this.prisma.user.findMany({
      include: {
        orgUnit: true,
        manager: { select: { id: true, fullName: true } },
        roles: { include: { role: true } },
      },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });

    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        orgUnit: user.orgUnit
          ? { id: user.orgUnit.id, name: user.orgUnit.name }
          : null,
        manager: user.manager
          ? { id: user.manager.id, fullName: user.manager.fullName }
          : null,
        roles: user.roles.map((entry) => ({
          code: entry.role.code,
          name: entry.role.name,
        })),
        createdAt: user.createdAt.toISOString(),
      })),
    };
  }
}
