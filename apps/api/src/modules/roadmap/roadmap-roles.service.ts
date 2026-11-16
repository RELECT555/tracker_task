import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

type RoleAssignment = {
  personExternalId?: string | null;
  personExternalIds?: string[];
  memberAllocations?: { personExternalId: string; allocationPercent: number }[];
};

const roleCatalogSelect = {
  id: true,
  name: true,
  color: true,
  isMock: true,
  azureEstimateField: true,
} as const;

/** Project roles, the shared role catalog and role members. */
@Injectable()
export class RoadmapRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(projectId: string) {
    if (!projectId)
      throw new BadRequestException(
        'A project must be selected before loading its roles',
      );
    return this.listAdminRoles(projectId);
  }

  async listAdminRoles(projectId?: string) {
    const roles = await this.prisma.roadmapRole.findMany({
      where: { projectId: projectId ?? { not: null } },
      orderBy: { name: 'asc' },
      include: {
        members: {
          include: { person: true },
          orderBy: { person: { name: 'asc' } },
        },
        defaultPerson: true,
        project: { select: { name: true } },
      },
    });
    return roles.map((role) => ({
      id: role.id,
      projectId: role.projectId,
      projectName: role.project?.name ?? null,
      name: role.name,
      color: role.color,
      isMock: role.isMock,
      azureEstimateField: role.azureEstimateField,
      defaultPersonExternalId: role.defaultPersonExternalId,
      defaultPersonName: role.defaultPerson?.name ?? null,
      defaultPersonEmail: role.defaultPerson?.email ?? null,
      defaultPersonIsMock: role.defaultPerson?.isMock ?? false,
      members: role.members.map(({ person, allocationPercent }) => ({
        personExternalId: person.externalId,
        personName: person.name,
        personEmail: person.email,
        personIsActive: person.isActive,
        personIsMock: person.isMock,
        allocationPercent: Number(allocationPercent),
      })),
    }));
  }

  async createRole(dto: { projectId: string; name: string; color?: string }) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Введите название роли.');
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: dto.projectId },
      select: { id: true },
    });
    if (!project)
      throw new NotFoundException(
        'Import the Azure DevOps project before creating its roles',
      );
    return this.prisma.roadmapRole.create({
      data: { projectId: project.id, name, color: dto.color ?? '#6366f1' },
    });
  }

  async listRoleCatalog() {
    return this.prisma.roadmapRole.findMany({
      where: { projectId: null },
      orderBy: { name: 'asc' },
      select: roleCatalogSelect,
    });
  }

  /**
   * Removes a role from the shared catalog. Project roles are independent copies
   * (matched by name only), so roles already added to projects stay untouched.
   */
  async deleteRoleTemplate(id: string) {
    const { count } = await this.prisma.roadmapRole.deleteMany({
      where: { id, projectId: null },
    });
    if (!count) throw new NotFoundException('Роль не найдена в каталоге.');
    return { deleted: true };
  }

  async createRoleTemplate(
    dto: { name: string; color?: string; projectId?: string } & RoleAssignment,
  ) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Введите название роли.');
    if (
      await this.prisma.roadmapRole.findFirst({
        where: { projectId: null, name },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        'A role with this name already exists in the role catalog',
      );
    }
    const color = dto.color ?? '#6366f1';
    if (!dto.projectId) {
      return this.prisma.roadmapRole.create({
        data: { projectId: null, name, color },
        select: roleCatalogSelect,
      });
    }

    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: dto.projectId },
      select: { id: true },
    });
    if (!project)
      throw new NotFoundException('Загрузите проект перед добавлением роли.');

    return this.prisma.$transaction(async (tx) => {
      const members = await this.resolveRolePeople(tx, dto);
      const template = await tx.roadmapRole.create({
        data: { projectId: null, name, color },
        select: roleCatalogSelect,
      });
      await tx.roadmapRole.create({
        data: {
          projectId: project.id,
          name,
          color,
          ...this.assignedRoleData(dto, members),
        },
      });
      return template;
    });
  }

  async addRoleFromCatalog(
    projectId: string,
    templateId: string,
    assignment: RoleAssignment = {},
  ) {
    const [project, template] = await Promise.all([
      this.prisma.roadmapProject.findUnique({
        where: { id: projectId },
        select: { id: true },
      }),
      this.prisma.roadmapRole.findFirst({
        where: { id: templateId, projectId: null },
      }),
    ]);
    if (!project)
      throw new NotFoundException(
        'Import the Azure DevOps project before adding roles',
      );
    if (!template)
      throw new NotFoundException(
        'The selected role is not in the role catalog',
      );
    if (
      await this.prisma.roadmapRole.findFirst({
        where: { projectId, name: template.name },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        'This project already has a role with this name',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const members = await this.resolveRolePeople(tx, assignment);
      return tx.roadmapRole.create({
        data: {
          projectId,
          name: template.name,
          color: template.color,
          isMock: template.isMock,
          ...this.assignedRoleData(assignment, members),
        },
      });
    });
  }

  private assignedRoleData(
    dto: RoleAssignment,
    members: { personId: string; allocationPercent: number }[] | undefined,
  ) {
    return {
      defaultPersonExternalId: dto.memberAllocations
        ? null
        : (dto.personExternalId ?? null),
      members: members?.length ? { createMany: { data: members } } : undefined,
    };
  }

  async updateRole(
    id: string,
    dto: { name?: string; color?: string } & RoleAssignment,
  ) {
    const name = dto.name?.trim();
    if (name === '') throw new BadRequestException('Введите название роли.');

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.roadmapRole.findUnique({
        where: { id },
        select: { projectId: true, defaultPersonExternalId: true },
      });
      if (!role?.projectId)
        throw new NotFoundException('Роль в проекте не найдена.');

      const members = await this.resolveRolePeople(tx, dto, id);
      const defaultPersonExternalId =
        dto.memberAllocations !== undefined
          ? null
          : dto.personExternalId !== undefined
            ? dto.personExternalId
            : dto.personExternalIds &&
                role.defaultPersonExternalId &&
                !dto.personExternalIds.includes(role.defaultPersonExternalId)
              ? null
              : undefined;

      return tx.roadmapRole.update({
        where: { id },
        data: {
          name,
          color: dto.color,
          defaultPersonExternalId,
          members: members && {
            deleteMany: {},
            createMany: members.length ? { data: members } : undefined,
          },
        },
      });
    });
  }

  private async resolveRolePeople(
    tx: Prisma.TransactionClient,
    dto: RoleAssignment,
    roleId?: string,
  ) {
    if (dto.memberAllocations !== undefined) {
      const allocations = dto.memberAllocations;
      if (
        !Array.isArray(allocations) ||
        dto.personExternalIds !== undefined ||
        dto.personExternalId
      ) {
        throw new BadRequestException(
          'Укажите сотрудников и проценты участия единым списком.',
        );
      }
      const invalid = allocations.some(
        (member) =>
          !member ||
          typeof member.personExternalId !== 'string' ||
          !member.personExternalId.trim() ||
          !Number.isFinite(member.allocationPercent) ||
          member.allocationPercent < 0 ||
          member.allocationPercent > 100 ||
          Math.abs(
            member.allocationPercent * 100 -
              Math.round(member.allocationPercent * 100),
          ) > 1e-8,
      );
      if (
        invalid ||
        new Set(allocations.map((member) => member.personExternalId)).size !==
          allocations.length
      ) {
        throw new BadRequestException(
          'Каждый сотрудник должен быть указан один раз с процентом от 0 до 100 и не более чем двумя знаками после запятой.',
        );
      }
      if (
        allocations.length &&
        allocations.reduce(
          (sum, member) => sum + Math.round(member.allocationPercent * 100),
          0,
        ) !== 10000
      ) {
        throw new BadRequestException(
          'Сумма участия сотрудников должна быть равна 100%.',
        );
      }
    }
    if (
      !dto.personExternalId &&
      dto.personExternalIds === undefined &&
      dto.memberAllocations === undefined
    )
      return undefined;

    const externalIds = new Set(
      dto.memberAllocations?.map((member) => member.personExternalId) ??
        dto.personExternalIds ??
        [],
    );
    if (
      roleId &&
      dto.personExternalId &&
      dto.personExternalIds === undefined &&
      dto.memberAllocations === undefined
    ) {
      const existing = await tx.roadmapRoleMember.findMany({
        where: { roleId },
        select: { person: { select: { externalId: true } } },
      });
      existing.forEach(({ person }) => externalIds.add(person.externalId));
    }
    if (dto.personExternalId) externalIds.add(dto.personExternalId);
    const people = await tx.roadmapPerson.findMany({
      where: { externalId: { in: [...externalIds] } },
      select: {
        id: true,
        externalId: true,
        isActive: true,
        roleMemberships: roleId
          ? { where: { roleId }, select: { id: true } }
          : false,
      },
    });
    const invalid = people.some(
      (person) =>
        !person.isActive &&
        (person.externalId === dto.personExternalId ||
          !person.roleMemberships?.length),
    );
    if (invalid || people.length !== externalIds.size) {
      throw new BadRequestException(
        'Проверьте, что выбранные сотрудники активны и есть в справочнике.',
      );
    }
    const specified = new Map(
      dto.memberAllocations?.map((member) => [
        member.personExternalId,
        member.allocationPercent,
      ]),
    );
    const peopleByExternalId = new Map(
      people.map((person) => [person.externalId, person]),
    );
    const equalCents = externalIds.size
      ? Math.floor(10000 / externalIds.size)
      : 0;
    const remainder = externalIds.size ? 10000 % externalIds.size : 0;
    return [...externalIds].map((externalId, index) => ({
      personId: peopleByExternalId.get(externalId)!.id,
      allocationPercent:
        specified.get(externalId) ??
        (equalCents + (index < remainder ? 1 : 0)) / 100,
    }));
  }

  async setRoleMembers(roleId: string, personExternalIds: string[]) {
    await this.updateRole(roleId, { personExternalIds });
    const role = await this.prisma.roadmapRole.findUnique({
      where: { id: roleId },
      include: {
        members: {
          include: { person: true },
          orderBy: { person: { name: 'asc' } },
        },
      },
    });
    return role
      ? {
          id: role.id,
          projectId: role.projectId,
          name: role.name,
          color: role.color,
          isMock: role.isMock,
          members: role.members.map(({ person, allocationPercent }) => ({
            personExternalId: person.externalId,
            personName: person.name,
            personEmail: person.email,
            personIsActive: person.isActive,
            personIsMock: person.isMock,
            allocationPercent: Number(allocationPercent),
          })),
        }
      : null;
  }

  async setRoleDefaultPerson(roleId: string, personExternalId: string | null) {
    const role = await this.prisma.roadmapRole.findUnique({
      where: { id: roleId },
      select: { id: true, projectId: true },
    });
    if (!role || !role.projectId)
      throw new NotFoundException('Project role was not found');
    if (personExternalId) {
      const member = await this.prisma.roadmapRoleMember.findFirst({
        where: {
          roleId,
          person: { externalId: personExternalId, isActive: true },
        },
        select: { id: true },
      });
      if (!member)
        throw new BadRequestException(
          'The default person must be active and assigned to this role',
        );
    }
    const updated = await this.prisma.roadmapRole.update({
      where: { id: roleId },
      data: { defaultPersonExternalId: personExternalId },
      include: { defaultPerson: true },
    });
    return {
      id: updated.id,
      projectId: updated.projectId,
      name: updated.name,
      color: updated.color,
      defaultPersonExternalId: updated.defaultPersonExternalId,
      defaultPersonName: updated.defaultPerson?.name ?? null,
      defaultPersonEmail: updated.defaultPerson?.email ?? null,
      defaultPersonIsMock: updated.defaultPerson?.isMock ?? false,
    };
  }

  async deleteRole(id: string) {
    if (await this.prisma.roadmapAllocation.count({ where: { roleId: id } })) {
      throw new ConflictException(
        'Роль уже используется в плане проекта. Сначала снимите её назначения с фич.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.roadmapRole.findUnique({
        where: { id },
        select: { projectId: true, name: true, color: true, isMock: true },
      });
      await tx.roadmapRole.delete({ where: { id } });
      // A role removed from a project goes back to the catalog so it can be re-added or used elsewhere.
      if (!role?.projectId) return;
      const inCatalog = await tx.roadmapRole.findFirst({
        where: { projectId: null, name: role.name },
        select: { id: true },
      });
      if (!inCatalog) {
        await tx.roadmapRole.create({
          data: {
            projectId: null,
            name: role.name,
            color: role.color,
            isMock: role.isMock,
          },
        });
      }
    });
    return { deleted: true };
  }
}
