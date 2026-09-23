import {
  BadGatewayException,
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
    const credentials = await this.integration.getCredentials();
    const data = await this.azureJson<{ value: AzureProject[] }>(
      `${credentials.organizationUrl}/_apis/projects?stateFilter=wellFormed&$top=1000&api-version=${this.apiVersion}`,
      credentials,
    );
    const saved = await this.prisma.roadmapProject.findMany({ select: { id: true, externalId: true } });
    const savedIds = new Map(saved.map((project) => [project.externalId, project.id]));
    return {
      data: data.value.map((project) => ({
        ...project,
        imported: savedIds.has(project.id),
        roadmapId: savedIds.get(project.id),
      })),
    };
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
    const roles = await this.listRoles();
    return { ...project, roles };
  }

  async listAzurePeople() {
    const people = await this.prisma.roadmapPerson.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { externalId: true, name: true, email: true },
    });
    return { data: people.map((person) => ({ id: person.externalId, name: person.name, email: person.email })) };
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
    const validPeople = people.filter((person) => person.subjectKind === 'user' && person.displayName);
    const externalIds = validPeople.map((person) => person.descriptor);
    await this.prisma.$transaction([
      ...validPeople.map((person) => this.prisma.roadmapPerson.upsert({
        where: { externalId: person.descriptor },
        create: {
          externalId: person.descriptor,
          name: person.displayName!,
          email: person.mailAddress ?? person.principalName ?? null,
          syncedAt: new Date(),
        },
        update: {
          name: person.displayName!,
          email: person.mailAddress ?? person.principalName ?? null,
          isActive: true,
          syncedAt: new Date(),
        },
      })),
      this.prisma.roadmapPerson.updateMany({
        where: { externalId: { notIn: externalIds.length ? externalIds : ['__none__'] } },
        data: { isActive: false },
      }),
    ]);
    return { synced: validPeople.length };
  }

  async listRoles() {
    const roles = await this.prisma.roadmapRole.findMany({
      orderBy: { name: 'asc' },
      include: { members: { include: { person: true }, orderBy: { person: { name: 'asc' } } } },
    });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      members: role.members.map(({ person }) => ({
        personExternalId: person.externalId,
        personName: person.name,
        personEmail: person.email,
        personIsActive: person.isActive,
      })),
    }));
  }

  createRole(dto: { name: string; color?: string }) {
    return this.prisma.roadmapRole.create({
      data: { name: dto.name.trim(), color: dto.color ?? '#6366f1' },
    });
  }

  async adminPeople() {
    const people = await this.prisma.roadmapPerson.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { roleMemberships: { include: { role: { select: { id: true, name: true, color: true } } } } },
    });
    return people.map((person) => ({
      id: person.externalId,
      name: person.name,
      email: person.email,
      isActive: person.isActive,
      roles: person.roleMemberships.map((membership) => membership.role),
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
    const role = await this.prisma.roadmapRole.findUnique({
      where: { id: roleId },
      include: { members: { include: { person: true }, orderBy: { person: { name: 'asc' } } } },
    });
    return role ? {
      id: role.id,
      name: role.name,
      color: role.color,
      members: role.members.map(({ person }) => ({
        personExternalId: person.externalId,
        personName: person.name,
        personEmail: person.email,
        personIsActive: person.isActive,
      })),
    } : null;
  }

  async deleteRole(id: string) {
    await this.prisma.roadmapRole.delete({ where: { id } });
    return { deleted: true };
  }

  async saveAllocation(dto: {
    workItemId: string;
    roleId: string;
    personExternalId: string;
    personName: string;
    personEmail?: string;
    estimatedHours: number;
    periods: { label: string; startsAt: string; endsAt: string; hours: number }[];
  }) {
    const workItem = await this.prisma.roadmapWorkItem.findUnique({
      where: { id: dto.workItemId },
      select: { id: true },
    });
    if (!workItem) throw new NotFoundException('Roadmap work item was not found');
    const allocation = await this.prisma.roadmapAllocation.upsert({
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
        personName: dto.personName,
        personEmail: dto.personEmail,
        estimatedHours: dto.estimatedHours,
      },
      update: {
        personName: dto.personName,
        personEmail: dto.personEmail,
        estimatedHours: dto.estimatedHours,
      },
    });
    await this.prisma.$transaction([
      this.prisma.roadmapPeriodAllocation.deleteMany({ where: { allocationId: allocation.id } }),
      ...dto.periods.map((period) =>
        this.prisma.roadmapPeriodAllocation.create({
          data: {
            allocationId: allocation.id,
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
