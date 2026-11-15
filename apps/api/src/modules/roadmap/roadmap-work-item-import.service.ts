import { BadGatewayException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  AzureDevOpsCredentials,
  RoadmapIntegrationService,
} from './roadmap-integration.service';

export type AzureWorkItem = {
  id: number;
  rev?: number;
  url: string;
  fields: Record<string, unknown>;
};
type AzureWorkItemField = {
  referenceName: string;
  name?: string;
  isCustom?: boolean;
  isDeleted?: boolean;
};
type CustomFieldCatalog = {
  names: string[];
  available: Set<string>;
  organizationUrl: string;
  loadedAt: number;
};
type ImportOptions = { requestTimeoutMs?: number; requireAll?: boolean };

const FIELD_CATALOG_TTL_MS = 10 * 60 * 1000;
const WORK_ITEM_BATCH_SIZE = 200;
const COMPLETED_WORK = 'Microsoft.VSTS.Scheduling.CompletedWork';
const CREATED_DATE = 'System.CreatedDate';
const ASSIGNED_TO = 'System.AssignedTo';

function completedWork(item: AzureWorkItem | undefined) {
  const value = item?.fields[COMPLETED_WORK];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wasCreatedAfter(item: AzureWorkItem | undefined, snapshot: Date) {
  const createdAt = item?.fields[CREATED_DATE];
  return (
    typeof createdAt === 'string' && Date.parse(createdAt) > snapshot.getTime()
  );
}

/** Reads Azure DevOps work items and stores them as Roadmap work items. */
@Injectable()
export class RoadmapWorkItemImportService {
  private readonly apiVersion = '7.1';
  private fieldCatalog: CustomFieldCatalog | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
  ) {}

  /** Downloads the given work items and upserts them into the Roadmap project. */
  async importWorkItems(
    project: { id: string },
    ids: number[],
    credentials: AzureDevOpsCredentials,
    { requestTimeoutMs, requireAll }: ImportOptions = {},
  ) {
    if (!ids.length) return [];
    const [settings, roles] = await Promise.all([
      this.integration.getSyncSettings(),
      this.prisma.roadmapRole.findMany({
        where: { projectId: project.id, azureEstimateField: { not: null } },
        select: { azureEstimateField: true },
      }),
    ]);
    const catalog = await this.customFields(
      credentials,
      settings,
      requestTimeoutMs ? AbortSignal.timeout(requestTimeoutMs) : undefined,
    );
    const names = new Set(catalog.names);
    for (const { azureEstimateField } of roles) {
      if (azureEstimateField && catalog.available.has(azureEstimateField))
        names.add(azureEstimateField);
    }
    const customFields = [...names];
    const fields = [
      ...new Set([
        'System.Id',
        'System.Title',
        'System.WorkItemType',
        'System.State',
        'System.Parent',
        COMPLETED_WORK,
        ASSIGNED_TO,
        ...customFields,
      ]),
    ];
    const imported: AzureWorkItem[] = [];
    for (let offset = 0; offset < ids.length; offset += WORK_ITEM_BATCH_SIZE) {
      const batchIds = ids.slice(offset, offset + WORK_ITEM_BATCH_SIZE);
      const batch = await this.integration.requestJson<{
        value: AzureWorkItem[];
      }>(
        `${credentials.organizationUrl}/_apis/wit/workitemsbatch?api-version=${this.apiVersion}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ids: batchIds,
            fields,
            errorPolicy: requireAll ? 'fail' : 'omit',
          }),
          signal: requestTimeoutMs
            ? AbortSignal.timeout(requestTimeoutMs)
            : undefined,
        },
        credentials,
      );
      const items = batch.value.filter(Boolean);
      if (requireAll) {
        const receivedIds = new Set(items.map((item) => item.id));
        if (
          items.length !== batchIds.length ||
          batchIds.some((id) => !receivedIds.has(id))
        ) {
          throw new BadGatewayException(
            'Azure DevOps returned an incomplete work item import',
          );
        }
      }
      imported.push(...items);
    }

    for (
      let offset = 0;
      offset < imported.length;
      offset += WORK_ITEM_BATCH_SIZE
    ) {
      await this.prisma.$transaction(
        imported
          .slice(offset, offset + WORK_ITEM_BATCH_SIZE)
          .map((item) => this.upsert(project.id, item, customFields)),
      );
    }
    return imported;
  }

  /** Returns net changes to the cumulative Completed Work field between two snapshots. */
  async getCompletedWorkChanges(ids: number[], before: Date, through: Date) {
    const changes = new Map<string, number>();
    if (!ids.length) return changes;

    const credentials = await this.integration.getCredentials();
    const snapshot = async (batchIds: number[], asOf?: Date) => {
      const result = await this.integration.requestJson<{
        value: AzureWorkItem[];
      }>(
        `${credentials.organizationUrl}/_apis/wit/workitemsbatch?api-version=${this.apiVersion}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ids: batchIds,
            fields: [COMPLETED_WORK, CREATED_DATE],
            asOf: asOf?.toISOString(),
            errorPolicy: asOf ? 'omit' : 'fail',
          }),
        },
        credentials,
      );
      const requested = new Set(batchIds);
      const items = new Map<number, AzureWorkItem>();
      if (!Array.isArray(result?.value)) {
        throw new BadGatewayException(
          'Azure DevOps returned an invalid work item snapshot',
        );
      }
      for (const item of result.value) {
        if (
          !item?.fields ||
          typeof item.fields !== 'object' ||
          Array.isArray(item.fields) ||
          !requested.has(item.id) ||
          items.has(item.id) ||
          (item.fields[COMPLETED_WORK] != null && completedWork(item) === null)
        ) {
          throw new BadGatewayException(
            'Azure DevOps returned an invalid work item snapshot',
          );
        }
        items.set(item.id, item);
      }
      return items;
    };

    for (let offset = 0; offset < ids.length; offset += WORK_ITEM_BATCH_SIZE) {
      const batchIds = ids.slice(offset, offset + WORK_ITEM_BATCH_SIZE);
      const [start, end] = await Promise.all([
        snapshot(batchIds, before),
        snapshot(batchIds, through),
      ]);
      const missingAtEnd = batchIds.filter((id) => !end.has(id));
      // A historical request can omit a work item that did not exist yet. Check its
      // creation date before treating an omission as zero hours.
      const current = missingAtEnd.length
        ? await snapshot(missingAtEnd)
        : undefined;

      for (const id of batchIds) {
        const startItem = start.get(id);
        const endItem = end.get(id);
        if (
          !endItem &&
          (startItem || !wasCreatedAfter(current?.get(id), through))
        ) {
          throw new BadGatewayException(
            'Azure DevOps returned an incomplete work item snapshot',
          );
        }
        if (
          !startItem &&
          !wasCreatedAfter(endItem ?? current?.get(id), before)
        ) {
          throw new BadGatewayException(
            'Azure DevOps returned an incomplete work item snapshot',
          );
        }
        const hours =
          (completedWork(endItem) ?? 0) - (completedWork(startItem) ?? 0);
        changes.set(String(id), hours);
      }
    }
    return changes;
  }

  /** Makes the next import reload the custom field catalog (used by manual synchronization). */
  invalidateFieldCatalog() {
    this.fieldCatalog = null;
  }

  private upsert(
    projectId: string,
    item: AzureWorkItem,
    customFields: string[],
  ) {
    const fields = item.fields;
    const azureCustomFields = Object.fromEntries(
      customFields
        .filter((fieldName) => fields[fieldName] !== undefined)
        .map((fieldName) => [fieldName, fields[fieldName]]),
    );
    // Store null as well, so removing an assignee clears the old identity and
    // existing imports can be distinguished from cards awaiting enrichment.
    azureCustomFields[ASSIGNED_TO] = fields[ASSIGNED_TO] ?? null;
    const stringValue = (value: unknown, fallback: string | null = null) => {
      if (typeof value === 'string' || typeof value === 'number')
        return String(value);
      return fallback;
    };
    const data = {
      parentExternalId: stringValue(fields['System.Parent']),
      type: stringValue(fields['System.WorkItemType'], 'Feature')!,
      title: stringValue(fields['System.Title'], `Work item ${item.id}`)!,
      state: stringValue(fields['System.State']),
      url: item.url,
      actualHours: completedWork(item),
      azureCustomFields: azureCustomFields as Prisma.InputJsonObject,
    };
    return this.prisma.roadmapWorkItem.upsert({
      where: {
        projectId_externalId: { projectId, externalId: String(item.id) },
      },
      create: { projectId, externalId: String(item.id), ...data },
      update: data,
    });
  }

  /** Custom role/estimate fields shown in the plan; cached because the catalog is organization-wide. */
  private async customFields(
    credentials: AzureDevOpsCredentials,
    settings: Awaited<ReturnType<RoadmapIntegrationService['getSyncSettings']>>,
    signal?: AbortSignal,
  ): Promise<CustomFieldCatalog> {
    if (
      this.fieldCatalog?.organizationUrl === credentials.organizationUrl &&
      Date.now() - this.fieldCatalog.loadedAt < FIELD_CATALOG_TTL_MS
    )
      return this.fieldCatalog;
    const fieldCatalog = await this.integration.requestJson<{
      value: AzureWorkItemField[];
    }>(
      `${credentials.organizationUrl}/_apis/wit/fields?api-version=${this.apiVersion}`,
      signal ? { signal } : undefined,
      credentials,
    );
    const explicit = new Set([
      ...settings.readRules
        .filter((rule) => rule.field !== 'auto')
        .map((rule) => rule.field),
      settings.fact.field,
      ...settings.roleFields.flatMap((link) =>
        [link.estimateField, link.aggregateField].filter(
          (field): field is string => Boolean(field),
        ),
      ),
    ]);
    const legacyAuto =
      settings.readRules.some((rule) => rule.field === 'auto') ||
      settings.readRules.length === 0;
    const availableFields = fieldCatalog.value.filter(
      (field) => !field.isDeleted,
    );
    this.fieldCatalog = {
      organizationUrl: credentials.organizationUrl,
      available: new Set(availableFields.map((field) => field.referenceName)),
      names: availableFields
        .filter(
          (field) =>
            explicit.has(field.referenceName) ||
            (legacyAuto &&
              (field.isCustom || field.referenceName.startsWith('Custom.')) &&
              /role|estimate/i.test(
                `${field.name ?? ''} ${field.referenceName}`,
              )),
        )
        .map((field) => field.referenceName),
      loadedAt: Date.now(),
    };
    return this.fieldCatalog;
  }
}
