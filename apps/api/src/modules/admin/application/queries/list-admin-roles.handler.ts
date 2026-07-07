import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ListAdminRolesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      data: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
      })),
    };
  }
}
