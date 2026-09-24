import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapIntegrationService } from './roadmap-integration.service';

type AzureProject = { id: string; name: string; url?: string; state?: string };
type AzureWorkItemRef = { id: number; url: string };
type AzureWorkItem = {
  id: number;
  url: string;
  fields: Record<string, unknown>;
};
type AzurePerson = {
  descriptor: string;
  subjectKind?: string;
  isDeletedInOrigin?: boolean;
  metaType?: string;
  displayName?: string;
  mailAddress?: string;
  principalName?: string;
};

@Injectable()
export class RoadmapService {
  private readonly apiVersion = '7.1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
  ) {}

  connectionStatus() {
    return this.integration.getPublicSettings();
  }

  async listAzureProjects() {
    const saved = await this.prisma.roadmapProject.findMany({ select: { id: true, externalId: true } });
    const savedIds = new Map(saved.map((project) => [project.externalId, project.id]));
    try {
      const credentials = await this.integration.getCredentials();
      const data = await this.azureJson<{ value: AzureProject[] }>(
        `${credentials.organizationUrl}/_apis/projects?stateFilter=wellFormed&$top=1000&api-version=${this.apiVersion}`,
        credentials,
      );
      return {
        source: 'azure' as const,
        data: data.value.map((project) => ({
          ...project,
          imported: savedIds.has(project.id),
          roadmapId: savedIds.get(project.id),
        })),
      };
    } catch (error) {
      if (!saved.length) throw error;
      const localProjects = await this.prisma.roadmapProject.findMany({ orderBy: { name: 'asc' } });
      return {
        source: 'cache' as const,
        data: localProjects.map((project) => ({
          id: project.externalId,
          name: project.name,
          url: project.url ?? undefined,
          imported: true,
          roadmapId: project.id,
        })),
      };
    }
  }

  async syncProject(externalId: string, name: string, url?: string) {
    const credentials = await this.integration.getCredentials();
    const project = await this.prisma.roadmapProject.upsert({
      where: { externalId },
      create: { externalId, name, url },
      update: { name, url },
    });

    const wiql = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN ('Epic', 'Feature') ORDER BY [System.Id]`,
    };
    const result = await this.azureJson<{ workItems: AzureWorkItemRef[] }>(
      `${credentials.organizationUrl}/${encodeURIComponent(externalId)}/_apis/wit/wiql?$top=20000&api-version=${this.apiVersion}`,
      credentials,
      { method: 'POST', body: JSON.stringify(wiql) },
    );
    const imported: AzureWorkItem[] = [];
    for (let offset = 0; offset < result.workItems.length; offset += 200) {
      const ids = result.workItems.slice(offset, offset + 200).map((item) => item.id);
      if (!ids.length) continue;
      const fields = ['System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.Parent'];
      const batch = await this.azureJson<{ value: AzureWorkItem[] }>(
        `${credentials.organizationUrl}/_apis/wit/workitems?ids=${ids.join(',')}&fields=${encodeURIComponent(fields.join(','))}&api-version=${this.apiVersion}`,
        credentials,
      );
      imported.push(...batch.value);
    }

    for (let offset = 0; offset < imported.length; offset += 200) {
      const databaseBatch = imported.slice(offset, offset + 200).map((item) => {
        const fields = item.fields;
        return this.prisma.roadmapWorkItem.upsert({
          where: { projectId_externalId: { projectId: project.id, externalId: String(item.id) } },
          create: {
            projectId: project.id,
            externalId: String(item.id),
            parentExternalId: fields['System.Parent'] ? String(fields['System.Parent']) : null,
            type: String(fields['System.WorkItemType'] ?? 'Feature'),
            title: String(fields['System.Title'] ?? `Work item ${item.id}`),
            state: fields['System.State'] ? String(fields['System.State']) : null,
            url: item.url,
          },
          update: {
            parentExternalId: fields['System.Parent'] ? String(fields['System.Parent']) : null,
            type: String(fields['System.WorkItemType'] ?? 'Feature'),
            title: String(fields['System.Title'] ?? `Work item ${item.id}`),
            state: fields['System.State'] ? String(fields['System.State']) : null,
            url: item.url,
          },
        });
      });
      await this.prisma.$transaction(databaseBatch);
    }
    await this.prisma.roadmapProject.update({
      where: { id: project.id },
      data: { syncedAt: new Date() },
    });
    return { projectId: project.id, importedWorkItems: imported.length };
  }

  async getProjectPlan(projectId: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      include: {
        workItems: {
          orderBy: [{ type: 'asc' }, { externalId: 'asc' }],
          include: {
            allocations: {
              include: { role: true, periods: { orderBy: { startsAt: 'asc' } } },
            },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const roles = await this.listRoles(projectId);
    return { ...project, roles };
  }

  async listAzurePeople() {
    const people = await this.prisma.roadmapPerson.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { externalId: true, name: true, email: true, isMock: true },
    });
    return { data: people.map((person) => ({ id: person.externalId, name: person.name, email: person.email, isMock: person.isMock })) };
  }

  async syncAzurePeople() {
    const credentials = await this.integration.getCredentials();
    const people: AzurePerson[] = [];
    let continuationToken: string | null = null;
    do {
      const query = new URLSearchParams({ 'api-version': '7.1-preview.1' });
      if (continuationToken) query.set('continuationToken', continuationToken);
      const response = await this.azureResponse(
        `https://vssps.dev.azure.com/${credentials.organization}/_apis/graph/users?${query.toString()}`,
        credentials,
      );
      const data = (await response.json()) as { value: AzurePerson[] };
      people.push(...(data.value ?? []));
      continuationToken = response.headers.get('x-ms-continuationtoken');
    } while (continuationToken);
    const serviceAccountPattern = /\b(?:agent pool service|build service|(?:project )?collection service accounts?|azure devops service|visual studio team services|team foundation service|release management service|adminpbi)\b/i;
    const validPeople = people.filter((person) => {
      const name = person.displayName?.trim();
      const identity = `${name ?? ''} ${person.principalName ?? ''}`;
      return person.subjectKind === 'user'
        && !person.isDeletedInOrigin
        && Boolean(name)
        && Boolean(person.mailAddress || person.principalName)
        && !serviceAccountPattern.test(identity);
    });
    if (people.length && !validPeople.length) {
      throw new BadGatewayException('Azure DevOps did not return any eligible human user profiles; the existing user list was left unchanged');
    }
    const externalIds = validPeople.map((person) => person.descriptor);
    await this.prisma.$transaction([
      ...validPeople.map((person) => this.prisma.roadmapPerson.upsert({
        where: { externalId: person.descriptor },
        create: {
          externalId: person.descriptor,
          name: person.displayName!,
          email: person.mailAddress ?? person.principalName ?? null,
          isMock: false,
          syncedAt: new Date(),
        },
        update: {
          name: person.displayName!,
          email: person.mailAddress ?? person.principalName ?? null,
          isActive: true,
          isMock: false,
          syncedAt: new Date(),
        },
      })),
      this.prisma.roadmapPerson.updateMany({
        where: { isMock: false, externalId: { notIn: externalIds.length ? externalIds : ['__none__'] } },
        data: { isActive: false },
      }),
      this.prisma.roadmapRole.updateMany({
        where: { defaultPerson: { isMock: false }, defaultPersonExternalId: { notIn: externalIds.length ? externalIds : ['__none__'] } },
        data: { defaultPersonExternalId: null },
      }),
    ]);
    return { synced: validPeople.length, ignored: people.length - validPeople.length };
  }

  async listRoles(projectId: string) {
    if (!projectId) throw new BadRequestException('A project must be selected before loading its roles');
    const roles = await this.prisma.roadmapRole.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
      include: {
        members: { include: { person: true }, orderBy: { person: { name: 'asc' } } },
        defaultPerson: true,
      },
    });
    return roles.map((role) => ({
      id: role.id,
      projectId: role.projectId,
      name: role.name,
      color: role.color,
      isMock: role.isMock,
      defaultPersonExternalId: role.defaultPersonExternalId,
      defaultPersonName: role.defaultPerson?.name ?? null,
      defaultPersonEmail: role.defaultPerson?.email ?? null,
      defaultPersonIsMock: role.defaultPerson?.isMock ?? false,
      members: role.members.map(({ person }) => ({
        personExternalId: person.externalId,
        personName: person.name,
        personEmail: person.email,
        personIsActive: person.isActive,
        personIsMock: person.isMock,
      })),
    }));
  }

  async createRole(dto: { projectId: string; name: string; color?: string }) {
    const project = await this.prisma.roadmapProject.findUnique({ where: { id: dto.projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Import the Azure DevOps project before creating its roles');
    return this.prisma.roadmapRole.create({
      data: { projectId: project.id, name: dto.name.trim(), color: dto.color ?? '#6366f1' },
    });
  }

  async listRoleCatalog() {
    return this.prisma.roadmapRole.findMany({
      where: { projectId: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, isMock: true },
    });
  }

  async createRoleTemplate(dto: { name: string; color?: string }) {
    const name = dto.name.trim();
    if (await this.prisma.roadmapRole.findFirst({ where: { projectId: null, name }, select: { id: true } })) {
      throw new ConflictException('A role with this name already exists in the role catalog');
    }
    return this.prisma.roadmapRole.create({
      data: { projectId: null, name, color: dto.color ?? '#6366f1' },
      select: { id: true, name: true, color: true, isMock: true },
    });
  }

  async addRoleFromCatalog(projectId: string, templateId: string) {
    const [project, template] = await Promise.all([
      this.prisma.roadmapProject.findUnique({ where: { id: projectId }, select: { id: true } }),
      this.prisma.roadmapRole.findFirst({ where: { id: templateId, projectId: null } }),
    ]);
    if (!project) throw new NotFoundException('Import the Azure DevOps project before adding roles');
    if (!template) throw new NotFoundException('The selected role is not in the role catalog');
    if (await this.prisma.roadmapRole.findFirst({ where: { projectId, name: template.name }, select: { id: true } })) {
      throw new ConflictException('This project already has a role with this name');
    }
    return this.prisma.roadmapRole.create({
      data: { projectId, name: template.name, color: template.color, isMock: template.isMock },
    });
  }

  async adminPeople() {
    const people = await this.prisma.roadmapPerson.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { roleMemberships: { include: { role: { select: { id: true, name: true, color: true, project: { select: { name: true } } } } } } },
    });
    return people.map((person) => ({
      id: person.externalId,
      name: person.name,
      email: person.email,
      isActive: person.isActive,
      isMock: person.isMock,
      roles: person.roleMemberships.map((membership) => ({
        id: membership.role.id,
        name: membership.role.name,
        color: membership.role.color,
        projectName: membership.role.project?.name ?? null,
      })),
    }));
  }

  async updateRole(id: string, dto: { name?: string; color?: string }) {
    return this.prisma.roadmapRole.update({ where: { id }, data: dto });
  }

  async setRoleMembers(roleId: string, personExternalIds: string[]) {
    await this.prisma.roadmapRoleMember.deleteMany({ where: { roleId } });
    if (personExternalIds.length) {
      const people = await this.prisma.roadmapPerson.findMany({
        where: { externalId: { in: personExternalIds }, isActive: true },
        select: { id: true },
      });
      await this.prisma.roadmapRoleMember.createMany({
        data: people.map((person) => ({ roleId, personId: person.id })),
        skipDuplicates: true,
      });
    }
    if (personExternalIds.length) {
      await this.prisma.roadmapRole.updateMany({
        where: { id: roleId, defaultPersonExternalId: { notIn: personExternalIds } },
        data: { defaultPersonExternalId: null },
      });
    } else {
      await this.prisma.roadmapRole.update({ where: { id: roleId }, data: { defaultPersonExternalId: null } });
    }
    const role = await this.prisma.roadmapRole.findUnique({
      where: { id: roleId },
      include: { members: { include: { person: true }, orderBy: { person: { name: 'asc' } } } },
    });
    return role ? {
      id: role.id,
      projectId: role.projectId,
      name: role.name,
      color: role.color,
      isMock: role.isMock,
      members: role.members.map(({ person }) => ({
        personExternalId: person.externalId,
        personName: person.name,
        personEmail: person.email,
        personIsActive: person.isActive,
        personIsMock: person.isMock,
      })),
    } : null;
  }

  async setRoleDefaultPerson(roleId: string, personExternalId: string | null) {
    const role = await this.prisma.roadmapRole.findUnique({ where: { id: roleId }, select: { id: true, projectId: true } });
    if (!role || !role.projectId) throw new NotFoundException('Project role was not found');
    if (personExternalId) {
      const member = await this.prisma.roadmapRoleMember.findFirst({
        where: { roleId, person: { externalId: personExternalId, isActive: true } },
        select: { id: true },
      });
      if (!member) throw new BadRequestException('The default person must be active and assigned to this role');
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
    await this.prisma.roadmapRole.delete({ where: { id } });
    return { deleted: true };
  }

  async saveAllocation(dto: {
    allocationId?: string;
    workItemId: string;
    roleId: string;
    personExternalId: string;
    personName: string;
    personEmail?: string;
    estimatedHours: number;
    periods: { monthKey?: string; label: string; startsAt: string; endsAt: string; hours: number }[];
  }) {
    const monthKeys = dto.periods.flatMap((period) => period.monthKey ? [period.monthKey] : []);
    if (new Set(monthKeys).size !== monthKeys.length) throw new BadRequestException('Only one plan value is allowed per allocation and month');
    for (const period of dto.periods) {
      if (period.monthKey) {
        const [year, month] = period.monthKey.split('-').map(Number);
        const monthStart = `${period.monthKey}-01`;
        const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        if (period.startsAt.slice(0, 10) !== monthStart || period.endsAt.slice(0, 10) !== monthEnd) {
          throw new BadRequestException('A monthly plan must cover exactly one calendar month');
        }
        if (Math.abs(period.hours * 2 - Math.round(period.hours * 2)) > 1e-8) {
          throw new BadRequestException('Monthly plan values must use half-hour increments');
        }
      }
    }
    if (dto.periods.reduce((sum, period) => sum + period.hours, 0) > dto.estimatedHours + 1e-8) {
      throw new BadRequestException('Planned hours cannot exceed the allocation estimate');
    }
    const workItem = await this.prisma.roadmapWorkItem.findUnique({
      where: { id: dto.workItemId },
      select: { id: true, projectId: true },
    });
    if (!workItem) throw new NotFoundException('Roadmap work item was not found');
    const membership = await this.prisma.roadmapRoleMember.findFirst({
      where: { roleId: dto.roleId, role: { projectId: workItem.projectId }, person: { externalId: dto.personExternalId, isActive: true } },
      include: { person: true },
    });
    if (!membership) throw new BadRequestException('The person must be active and assigned to this role');
    let allocation;
    if (dto.allocationId) {
      const current = await this.prisma.roadmapAllocation.findUnique({ where: { id: dto.allocationId }, select: { id: true, workItemId: true, roleId: true } });
      if (!current || current.workItemId !== dto.workItemId || current.roleId !== dto.roleId) throw new NotFoundException('Roadmap allocation was not found');
      const duplicate = await this.prisma.roadmapAllocation.findFirst({
        where: { workItemId: dto.workItemId, roleId: dto.roleId, personExternalId: dto.personExternalId, id: { not: dto.allocationId } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('This person already has an estimate for this work item and role');
      allocation = await this.prisma.roadmapAllocation.update({
        where: { id: dto.allocationId },
        data: { personExternalId: dto.personExternalId, personName: membership.person.name, personEmail: membership.person.email, estimatedHours: dto.estimatedHours },
      });
    } else {
      allocation = await this.prisma.roadmapAllocation.upsert({
        where: {
          workItemId_roleId_personExternalId: {
            workItemId: dto.workItemId,
            roleId: dto.roleId,
            personExternalId: dto.personExternalId,
          },
        },
        create: {
        workItemId: dto.workItemId,
        roleId: dto.roleId,
        personExternalId: dto.personExternalId,
        personName: membership.person.name,
        personEmail: membership.person.email,
        estimatedHours: dto.estimatedHours,
        },
        update: {
          personName: membership.person.name,
          personEmail: membership.person.email,
          estimatedHours: dto.estimatedHours,
        },
      });
    }
    await this.prisma.$transaction([
      this.prisma.roadmapPeriodAllocation.deleteMany({ where: { allocationId: allocation.id } }),
      ...dto.periods.map((period) =>
        this.prisma.roadmapPeriodAllocation.create({
          data: {
            allocationId: allocation.id,
            monthKey: period.monthKey ?? null,
            label: period.label,
            startsAt: new Date(period.startsAt),
            endsAt: new Date(period.endsAt),
            hours: period.hours,
          },
        }),
      ),
    ]);
    return { ...allocation, periods: dto.periods };
  }

  async saveAllocationQuarter(allocationId: string, quarterKey: string, months: { monthKey: string; hours: number }[]) {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!match) throw new BadRequestException('Quarter must use YYYY-Qn format');
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const expectedMonths = Array.from({ length: 3 }, (_, index) => `${year}-${String((quarter - 1) * 3 + index + 1).padStart(2, '0')}`);
    if (months.length !== 3 || new Set(months.map((month) => month.monthKey)).size !== 3 || expectedMonths.some((key) => !months.some((month) => month.monthKey === key))) {
      throw new BadRequestException('A quarterly plan must include each of its three calendar months exactly once');
    }
    if (months.some((month) => !Number.isFinite(month.hours) || month.hours < 0 || Math.abs(month.hours * 2 - Math.round(month.hours * 2)) > 1e-8)) {
      throw new BadRequestException('Monthly plan values must be non-negative half-hour increments');
    }

    const normalized = months.map(({ monthKey, hours }) => {
      const [, monthNumber] = monthKey.split('-').map(Number);
      const startsAt = new Date(Date.UTC(year, monthNumber - 1, 1));
      const endsAt = new Date(Date.UTC(year, monthNumber, 0));
      return {
        monthKey,
        hours,
        startsAt,
        endsAt,
        label: new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(startsAt),
      };
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const allocation = await tx.roadmapAllocation.findUnique({
          where: { id: allocationId },
          select: { id: true, estimatedHours: true, periods: { select: { monthKey: true, hours: true } } },
        });
        if (!allocation) throw new NotFoundException('Roadmap allocation was not found');

        const monthKeys = normalized.map((month) => month.monthKey);
        const alreadyPlannedThisQuarter = allocation.periods
          .filter((period) => period.monthKey && monthKeys.includes(period.monthKey))
          .reduce((sum, period) => sum + Number(period.hours), 0);
        const totalPlanned = allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0);
        const nextTotal = totalPlanned - alreadyPlannedThisQuarter + normalized.reduce((sum, month) => sum + month.hours, 0);
        if (nextTotal > Number(allocation.estimatedHours) + 1e-8) {
          throw new BadRequestException(`План превышает оценку на ${Math.ceil((nextTotal - Number(allocation.estimatedHours)) * 2) / 2} ч`);
        }

        await tx.roadmapPeriodAllocation.deleteMany({ where: { allocationId, monthKey: { in: monthKeys } } });
        const plannedMonths = normalized.filter((month) => month.hours > 0);
        if (plannedMonths.length) {
          await tx.roadmapPeriodAllocation.createMany({
            data: plannedMonths.map((month) => ({ allocationId, ...month })),
          });
        }
        return plannedMonths;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2034') {
        throw new ConflictException('План изменился одновременно. Обновите страницу и повторите ввод.');
      }
      throw error;
    }
  }

  private async azureJson<T>(
    url: string,
    credentials: { pat: string },
    init?: RequestInit,
  ): Promise<T> {
    const response = await this.azureResponse(url, credentials, init);
    return (await response.json()) as T;
  }

  private async azureResponse(
    url: string,
    credentials: { pat: string },
    init?: RequestInit,
  ) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`:${credentials.pat}`).toString('base64')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
    } catch {
      throw new BadGatewayException('Could not reach Azure DevOps');
    }
    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(`Azure DevOps returned ${response.status}: ${details.slice(0, 500)}`);
    }
    return response;
  }
}
