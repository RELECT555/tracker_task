import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildRoadmapPortfolio,
  getRoadmapSummary,
  roadmapQuarterMonthKeys,
  type RoadmapPortfolioInput,
} from '@tracker/shared';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { azureWorkItemWebUrl } from './azure-work-item-url';
import { roadmapProjectReadFilter } from './roadmap-project-access.service';
import { RoadmapWriteBackAccessService } from './roadmap-write-back-access.service';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import {
  azureOrganizationName,
  canCreateRoadmapWorkItems,
  roadmapCreatedWorkItemUrl,
} from './roadmap-work-item-create.service';
import {
  isFactSource,
  isPlanItem,
  rollUpActualHours,
  type RoadmapFactItem,
} from './roadmap-fact-rollup';
import { RoadmapRolesService } from './roadmap-roles.service';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';

/** Reads project plans, portfolio summaries and fact hours. */
@Injectable()
export class RoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
    private readonly writeBackAccess: RoadmapWriteBackAccessService,
    private readonly roles: RoadmapRolesService,
    private readonly azureProcess: RoadmapAzureProcessService,
  ) {}

  connectionStatus() {
    return this.integration.getPublicSettings();
  }

  async getProjectSummaries(input: RoadmapPortfolioInput, email?: string) {
    const { projectIds, quarterKey, monthKey } = input;
    const projects = await this.prisma.roadmapProject.findMany({
      where: { id: { in: projectIds }, ...roadmapProjectReadFilter(email) },
      select: {
        id: true,
        roles: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            azureEstimateField: true,
            defaultPersonExternalId: true,
            members: {
              select: {
                person: { select: { externalId: true, isActive: true } },
              },
            },
          },
        },
        workItems: {
          orderBy: [{ type: 'asc' }, { externalId: 'asc' }],
          select: {
            id: true,
            externalId: true,
            type: true,
            parentExternalId: true,
            actualHours: true,
            azureCustomFields: true,
            iterationPath: true,
            allocations: {
              where: monthKey ? undefined : { quarterKey },
              select: {
                id: true,
                roleId: true,
                personExternalId: true,
                quarterKey: true,
                estimatedHours: true,
                azureTaskId: true,
                periods: monthKey
                  ? {
                      where: { monthKey },
                      select: { monthKey: true, hours: true },
                    }
                  : false,
              },
            },
          },
        },
      },
    });
    const entries = await Promise.all(
      projects.map(async ({ id, workItems, roles }) => {
        const byExternalId = new Map(
          workItems.map((item) => [item.externalId, item]),
        );
        const cumulativeFact = monthKey
          ? undefined
          : rollUpActualHours(
              workItems,
              byExternalId,
              (item) => Number(item.actualHours ?? 0),
              input.includeChildEpics,
            ).workItems;
        const monthlyFact =
          monthKey && input.includeMonthlyFact !== false
            ? await this.calculateProjectFact(
                workItems,
                monthKey,
                input.includeChildEpics,
              ).catch(() => undefined)
            : undefined;
        // Cards with fact but no plan count in the quarter only through the fact of its months. If any month
        // fails the counts stay plan-only, as they do while the quarter view has not asked for the fact.
        const quarterFact =
          !monthKey && input.includeQuarterFact
            ? await Promise.all(
                roadmapQuarterMonthKeys(quarterKey).map((key) =>
                  this.calculateProjectFact(
                    workItems,
                    key,
                    input.includeChildEpics,
                  ),
                ),
              ).catch(() => undefined)
            : undefined;
        // The quarter's sprints decide which cards carry their Azure estimates, exactly as in the project's own plan.
        // Without them (or when Azure cannot answer) every card counts, as before.
        const quarterIterations = monthKey
          ? undefined
          : await this.azureProcess
              .findQuarterIteration(id, quarterKey)
              .then((found) => ({
                paths: found.iterationPaths,
                scoped: found.scoped,
              }))
              .catch(() => undefined);
        const summary = getRoadmapSummary(
          {
            workItems: workItems.map((item) => ({
              ...item,
              actualHours: cumulativeFact?.get(item.id) ?? 0,
              azureCustomFields:
                item.azureCustomFields &&
                typeof item.azureCustomFields === 'object' &&
                !Array.isArray(item.azureCustomFields)
                  ? item.azureCustomFields
                  : null,
              allocations: item.allocations.map((allocation) => ({
                ...allocation,
                estimatedHours: Number(allocation.estimatedHours),
                periods: (allocation.periods ?? []).map((period) => ({
                  monthKey: period.monthKey,
                  hours: Number(period.hours),
                })),
              })),
            })),
            roles: roles.map(({ members, ...role }) => ({
              ...role,
              members: members.map(({ person }) => ({
                personExternalId: person.externalId,
                personIsActive: person.isActive,
              })),
            })),
          },
          { ...input, monthlyFact, quarterFact, quarterIterations },
        );
        return { id, summary };
      }),
    );
    return buildRoadmapPortfolio(entries, input);
  }

  async getProjectPlan(
    projectId: string,
    actorId: string,
    canEditPlan: boolean,
    includeChildEpics = false,
  ) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      include: {
        workItems: {
          orderBy: [{ type: 'asc' }, { externalId: 'asc' }],
          include: {
            allocations: {
              include: {
                role: true,
                periods: { orderBy: { startsAt: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const [roles, settings, createdItems] = await Promise.all([
      this.roles.listRoles(projectId),
      this.integration.getPublicSettings(),
      this.prisma.roadmapWorkItemCreateRequest.findMany({
        where: { projectId, status: 'complete', azureId: { not: null } },
        select: { azureId: true, azureOrganization: true, type: true },
      }),
    ]);
    const createdTaskIds = [
      ...new Set(
        createdItems.flatMap(({ azureId, type }) =>
          azureId && type === 'Task' ? [azureId] : [],
        ),
      ),
    ];
    const createdItemOrganizations = new Map(
      createdItems.map(({ azureId, azureOrganization }) => [
        azureId,
        azureOrganization,
      ]),
    );
    const projectOrganization = azureOrganizationName(project.url);
    const connectedOrganization = azureOrganizationName(
      settings.organizationUrl,
    );
    const itemByExternalId = new Map(
      project.workItems.map((item) => [item.externalId, item]),
    );
    const { workItems: rolledUpActualHours } = rollUpActualHours(
      project.workItems,
      itemByExternalId,
      (item) => Number(item.actualHours ?? 0),
      includeChildEpics,
    );
    const taskUrl = (taskId: string) =>
      settings.organizationUrl
        ? `${settings.organizationUrl}/${encodeURIComponent(project.name)}/_workitems/edit/${taskId}`
        : null;
    const workItems = project.workItems.map((item) => {
      // Each allocation's fact is the Completed Work logged on the Azure DevOps Task that mirrors it.
      const allocations =
        item.type.toLowerCase() === 'epic'
          ? []
          : item.allocations.map((allocation) => {
              const task = allocation.azureTaskId
                ? itemByExternalId.get(allocation.azureTaskId)
                : undefined;
              return {
                ...allocation,
                actualHours: task?.actualHours ?? null,
                azureTaskUrl: allocation.azureTaskId
                  ? taskUrl(allocation.azureTaskId)
                  : null,
                azureTaskState: task?.state ?? null,
              };
            });
      const createdOrganization = createdItemOrganizations.has(item.externalId)
        ? (createdItemOrganizations.get(item.externalId) ?? projectOrganization)
        : null;
      return {
        ...item,
        allocations,
        ownActualHours: item.actualHours,
        actualHours: isPlanItem(item)
          ? (rolledUpActualHours.get(item.id) ?? 0)
          : item.actualHours,
        url: createdOrganization
          ? roadmapCreatedWorkItemUrl(
              createdOrganization,
              project.name,
              item.externalId,
            )
          : // Старые импорты хранят REST-адрес — отдаём ссылку на карточку.
            (azureWorkItemWebUrl(item.url, project.name, item.externalId) ??
            item.url),
      };
    });
    return {
      ...project,
      workItems,
      roles,
      azure: {
        writeBackEnabled: settings.writeBackEnabled,
        mode: settings.writeBack.mode,
        canPush:
          canEditPlan &&
          settings.writeBackEnabled &&
          (!settings.writeBack.projectIds ||
            settings.writeBack.projectIds.includes(projectId)) &&
          (await this.writeBackAccess.canManuallyPush(
            actorId,
            settings.writeBack,
          )),
        canCreateWorkItems:
          settings.configured &&
          (!projectOrganization ||
            connectedOrganization === projectOrganization) &&
          canCreateRoadmapWorkItems(
            project.externalId,
            settings.organizationUrl,
          ),
        createdTaskIds,
        /** What happens to a Task when its allocation is removed (shown before deleting). */
        removal: settings.writeBack.removalPolicy ?? { action: 'keep' },
      },
    };
  }

  async getProjectFact(
    projectId: string,
    monthKey?: string,
    includeChildEpics = false,
  ) {
    if (
      typeof monthKey !== 'string' ||
      monthKey.length !== 7 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) ||
      monthKey.startsWith('0000-')
    ) {
      throw new BadRequestException('Month must use YYYY-MM format');
    }
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: {
        workItems: {
          select: {
            id: true,
            externalId: true,
            parentExternalId: true,
            type: true,
            allocations: { select: { id: true, azureTaskId: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    return this.calculateProjectFact(
      project.workItems,
      monthKey,
      includeChildEpics,
    );
  }

  private async calculateProjectFact(
    items: RoadmapFactItem[],
    monthKey: string,
    includeChildEpics = false,
  ) {
    const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`);
    const now = Date.now();
    if (monthStart.getTime() > now)
      return { workItems: {}, allocations: {}, totalHours: 0, sourceHours: {} };
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const before = new Date(monthStart.getTime() - 1);
    const through = new Date(Math.min(nextMonth.getTime() - 1, now));

    const itemByExternalId = new Map(
      items.map((item) => [item.externalId, item]),
    );
    const linkedAllocations = items
      .filter((item) => item.type.toLowerCase() !== 'epic')
      .flatMap((item) => item.allocations)
      .flatMap(({ id, azureTaskId }) =>
        azureTaskId && itemByExternalId.has(azureTaskId)
          ? [{ id, azureTaskId }]
          : [],
      );
    const sourceIds = new Set([
      ...items.filter(isFactSource).map((item) => item.externalId),
      ...linkedAllocations.map((allocation) => allocation.azureTaskId),
    ]);
    const azureIds = [...sourceIds]
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0 && id <= 2147483647);
    const changes = await this.importer.getCompletedWorkChanges(
      azureIds,
      before,
      through,
    );
    const { workItems, totalHours } = rollUpActualHours(
      items,
      itemByExternalId,
      (item) => changes.get(item.externalId) ?? 0,
      includeChildEpics,
    );
    const allocations = linkedAllocations.flatMap(({ id, azureTaskId }) => {
      const hours = changes.get(azureTaskId);
      return hours === undefined ? [] : [[id, hours] as const];
    });
    return {
      workItems: Object.fromEntries(workItems),
      allocations: Object.fromEntries(allocations),
      totalHours,
      sourceHours: Object.fromEntries(changes),
    };
  }
}
