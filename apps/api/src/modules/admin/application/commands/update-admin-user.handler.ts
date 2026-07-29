import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

export interface UpdateAdminUserCommand {
  id: string;
  fullName?: string;
  isActive?: boolean;
  orgUnitId?: string;
  managerId?: string | null;
  roleCodes?: string[];
}

@Injectable()
export class UpdateAdminUserHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateAdminUserCommand) {
    const user = await this.prisma.user.findUnique({
      where: { id: command.id },
    });

    if (!user) {
      throw new NotFoundError('User', command.id);
    }

    const data: {
      fullName?: string;
      isActive?: boolean;
      orgUnitId?: string;
      managerId?: string | null;
    } = {};

    if (command.fullName !== undefined) {
      const fullName = command.fullName.trim();
      if (!fullName) {
        throw new ValidationError('Укажите ФИО пользователя');
      }
      data.fullName = fullName;
    }

    if (command.isActive !== undefined) {
      data.isActive = command.isActive;
    }

    if (command.orgUnitId !== undefined) {
      const orgUnit = await this.prisma.orgUnit.findUnique({
        where: { id: command.orgUnitId },
      });
      if (!orgUnit) {
        throw new NotFoundError('OrgUnit', command.orgUnitId);
      }
      data.orgUnitId = command.orgUnitId;
    }

    if (command.managerId !== undefined) {
      if (command.managerId === command.id) {
        throw new ValidationError('Пользователь не может быть своим руководителем');
      }

      if (command.managerId) {
        const manager = await this.prisma.user.findUnique({
          where: { id: command.managerId },
        });
        if (!manager) {
          throw new NotFoundError('User', command.managerId);
        }
      }

      data.managerId = command.managerId;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({
        where: { id: command.id },
        data,
      });
    }

    if (command.roleCodes !== undefined) {
      if (command.roleCodes.length === 0) {
        throw new ValidationError('У пользователя должна быть хотя бы одна роль');
      }

      const roles = await this.prisma.role.findMany({
        where: { code: { in: command.roleCodes } },
      });

      if (roles.length !== command.roleCodes.length) {
        const found = new Set(roles.map((role) => role.code));
        const missing = command.roleCodes.filter((code) => !found.has(code));
        throw new ValidationError(`Неизвестные роли: ${missing.join(', ')}`);
      }

      await this.prisma.$transaction([
        this.prisma.userRole.deleteMany({ where: { userId: command.id } }),
        this.prisma.userRole.createMany({
          data: roles.map((role) => ({
            userId: command.id,
            roleId: role.id,
          })),
        }),
      ]);
    }

    return { id: command.id };
  }
}
