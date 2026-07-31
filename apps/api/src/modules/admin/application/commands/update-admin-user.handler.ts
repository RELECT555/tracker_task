import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AuditRecorder } from '../../../audit/application/audit-recorder';
import { buildAuditChanges } from '../../../audit/application/build-audit-changes';
import { AuditActions, AuditEntityTypes } from '../../../audit/domain/audit-action';

export interface UpdateAdminUserCommand {
  id: string;
  actorId: string;
  fullName?: string;
  isActive?: boolean;
  orgUnitId?: string;
  managerId?: string | null;
  roleCodes?: string[];
}

@Injectable()
export class UpdateAdminUserHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateAdminUserCommand) {
    const user = await this.prisma.user.findUnique({
      where: { id: command.id },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundError('User', command.id);
    }

    const before = {
      fullName: user.fullName,
      isActive: user.isActive,
      orgUnitId: user.orgUnitId,
      managerId: user.managerId,
      roleCodes: user.roles.map((entry) => entry.role.code).sort(),
    };

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

    const after = {
      fullName: data.fullName ?? before.fullName,
      isActive: data.isActive ?? before.isActive,
      orgUnitId: data.orgUnitId ?? before.orgUnitId,
      managerId:
        command.managerId !== undefined ? command.managerId : before.managerId,
      roleCodes:
        command.roleCodes !== undefined
          ? [...command.roleCodes].sort()
          : before.roleCodes,
    };

    const changes = buildAuditChanges(before, after);
    if (changes) {
      await this.audit.record({
        actorId: command.actorId,
        action: AuditActions.USER_UPDATED,
        entityType: AuditEntityTypes.USER,
        entityId: command.id,
        payload: { changes },
      });
    }

    return { id: command.id };
  }
}
