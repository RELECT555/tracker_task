import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  AzureDevOpsCredentials,
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import {
  AzureWorkItem,
  RoadmapWorkItemImportService,
} from './roadmap-work-item-import.service';
import { importWorkItemsRecorded } from './roadmap-import-health';
import { hoursField } from './roadmap-allocation-reconcile';
import { WriteBackSettings } from './roadmap-write-back.settings';
import {
  azureErrorMessage,
  SYNC_REQUEST_TIMEOUT_MS,
} from './roadmap-azure-sync.shared';

/** Writes each role's plan total to the role field of the feature in Azure DevOps. */
@Injectable()
export class RoadmapAzureFeatureFieldsService {
  private readonly logger = new Logger(RoadmapAzureFeatureFieldsService.name);
  private readonly apiVersion = '7.1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
  ) {}

  roleFieldName(
    settings: WriteBackSettings,
    role: { name: string; azureEstimateField: string | null },
  ) {
    return (
      settings.roleFields?.find((link) => link.roleName === role.name)
        ?.aggregateField ??
      role.azureEstimateField ??
      null
    );
  }

  /** The feature field that holds this role's hours, or null when the role has none. */
  async featureRoleField(settings: WriteBackSettings, roleId: string) {
    const role = await this.prisma.roadmapRole.findUnique({
      where: { id: roleId },
      select: { name: true, azureEstimateField: true },
    });
    return role ? this.roleFieldName(settings, role) : null;
  }

  /** Re-writes the feature's role totals after an allocation was deleted; the role's field drops to 0 with its last one. */
  async refreshFeatureField(workItemId: string, roleId: string) {
    const settings = await this.integration
      .getWriteBackSettings()
      .catch(() => null);
    if (!settings || settings.mode === 'off') return;
    try {
      const item = await this.prisma.roadmapWorkItem.findUnique({
        where: { id: workItemId },
        select: { projectId: true },
      });
      if (!item) return;
      if (settings.projectIds && !settings.projectIds.includes(item.projectId))
        return;
      await this.writeFeatureAggregates(
        workItemId,
        settings,
        await this.integration.getCredentials(),
        { quick: true, zeroRoleIds: [roleId] },
      );
    } catch (error) {
      this.logger.warn(
        `Could not refresh role totals of work item ${workItemId}: ${azureErrorMessage(error)}`,
      );
    }
  }

  /**
   * Writes the plan total of each role to the feature's role field in Azure DevOps
   * (the role's aggregate field from the field mapping, else its estimate field).
   */
  async writeFeatureAggregates(
    workItemId: string,
    settings: WriteBackSettings,
    credentials: AzureDevOpsCredentials,
    options?: { quick?: boolean; zeroRoleIds?: string[] },
  ) {
    const item = await this.prisma.roadmapWorkItem.findUnique({
      where: { id: workItemId },
      select: {
        externalId: true,
        projectId: true,
        allocations: {
          select: {
            roleId: true,
            estimatedHours: true,
            personExternalId: true,
          },
        },
      },
    });
    if (!item) return;
    const roles = await this.prisma.roadmapRole.findMany({
      where: { projectId: item.projectId },
      select: { id: true, name: true, azureEstimateField: true },
    });
    // Demo participants are never sent to Azure DevOps, so their hours stay out of the totals.
    const mockPeople = new Set(
      (
        await this.prisma.roadmapPerson.findMany({
          where: {
            externalId: {
              in: item.allocations.map(
                (allocation) => allocation.personExternalId,
              ),
            },
            isMock: true,
          },
          select: { externalId: true },
        })
      ).map((person) => person.externalId),
    );
    const totals = new Map<string, number>();
    for (const role of roles) {
      const field = this.roleFieldName(settings, role);
      if (!field) continue;
      const roleAllocations = item.allocations
        .filter((allocation) => !mockPeople.has(allocation.personExternalId))
        .filter((allocation) => allocation.roleId === role.id);
      // A role without assignments may hold hours typed straight into the field: leave them alone.
      if (!roleAllocations.length && !options?.zeroRoleIds?.includes(role.id))
        continue;
      const hours = roleAllocations.reduce(
        (sum, allocation) => sum + Number(allocation.estimatedHours),
        0,
      );
      totals.set(field, (totals.get(field) ?? 0) + hours);
    }
    await this.writeFeatureFields(item, totals, credentials, {
      quick: options?.quick,
    });
  }

  /**
   * Sets feature fields in one PATCH, skipping values that already match. The stored copy of the
   * feature is then refreshed: by a full re-import, or (`quick`) by merging just the written values,
   * which is what a user typing into a cell waits for — the next webhook import confirms the rest.
   */
  async writeFeatureFields(
    item: { externalId: string; projectId: string },
    totals: Map<string, number>,
    credentials: AzureDevOpsCredentials,
    { quick = false }: { quick?: boolean } = {},
  ) {
    if (!totals.size) return;
    for (let attempt = 0; ; attempt += 1) {
      const feature = await this.integration.requestJson<AzureWorkItem>(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(item.externalId)}?fields=${[...totals.keys()].map(encodeURIComponent).join(',')}&api-version=${this.apiVersion}`,
        { signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS) },
        credentials,
      );
      const written = [...totals]
        .map(
          ([field, hours]) => [field, Math.round(hours * 100) / 100] as const,
        )
        .filter(
          ([field, hours]) => hoursField(feature.fields[field]) !== hours,
        );
      if (!written.length) return;
      try {
        await this.integration.request(
          `${credentials.organizationUrl}/_apis/wit/workitems/${feature.id}?api-version=${this.apiVersion}`,
          {
            method: 'PATCH',
            body: JSON.stringify([
              { op: 'test', path: '/rev', value: feature.rev },
              ...written.map(([field, hours]) => ({
                op: 'add',
                path: `/fields/${field}`,
                value: hours,
              })),
            ]),
            headers: { 'Content-Type': 'application/json-patch+json' },
            signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
          },
          credentials,
        );
        if (quick) await this.mergeStoredFields(item, written);
        else
          await importWorkItemsRecorded(
            this.prisma,
            this.importer,
            item.projectId,
            [feature.id],
            credentials,
          );
        return;
      } catch (error) {
        // Someone edited the feature at the same moment: read it again and write on top.
        if (
          attempt === 0 &&
          error instanceof AzureDevOpsHttpError &&
          [409, 412].includes(error.httpStatus)
        )
          continue;
        throw error;
      }
    }
  }

  /** Puts just-written field values into the stored copy of the work item. */
  private async mergeStoredFields(
    item: { externalId: string; projectId: string },
    written: readonly (readonly [string, number])[],
  ) {
    const where = {
      projectId_externalId: {
        projectId: item.projectId,
        externalId: item.externalId,
      },
    };
    const stored = await this.prisma.roadmapWorkItem.findUnique({
      where,
      select: { azureCustomFields: true },
    });
    const current =
      stored?.azureCustomFields &&
      typeof stored.azureCustomFields === 'object' &&
      !Array.isArray(stored.azureCustomFields)
        ? stored.azureCustomFields
        : {};
    await this.prisma.roadmapWorkItem.update({
      where,
      data: {
        azureCustomFields: {
          ...current,
          ...Object.fromEntries(written),
        },
      },
    });
  }
}
