import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { AzureDevOpsCredentials, RoadmapIntegrationService } from './roadmap-integration.service';

export type AzureWorkItem = {
  id: number;
  rev?: number;
  url: string;
  fields: Record<string, unknown>;
};
type AzureWorkItemField = { referenceName: string; name?: string; isCustom?: boolean };
type CustomFieldCatalog = { names: string[]; loadedAt: number };

const FIELD_CATALOG_TTL_MS = 10 * 60 * 1000;

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
  async importWorkItems(project: { id: string }, ids: number[], credentials: AzureDevOpsCredentials) {
    const settings = await this.integration.getSyncSettings();
    const catalog = await this.customFields(credentials, settings);
    const imported: AzureWorkItem[] = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batchIds = ids.slice(offset, offset + 200);
      if (!batchIds.length) continue;
      const fields = [
        'System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.Parent',
        'Microsoft.VSTS.Scheduling.CompletedWork',
        ...catalog.names,
      ];
      const batch = await this.integration.requestJson<{ value: AzureWorkItem[] }>(
        `${credentials.organizationUrl}/_apis/wit/workitemsbatch?api-version=${this.apiVersion}`,
        { method: 'POST', body: JSON.stringify({ ids: batchIds, fields, errorPolicy: 'omit' }) },
        credentials,
      );
      imported.push(...batch.value.filter(Boolean));
    }

    for (let offset = 0; offset < imported.length; offset += 200) {
      await this.prisma.$transaction(
        imported.slice(offset, offset + 200).map((item) => this.upsert(project.id, item, catalog)),
      );
    }
    return imported;
  }

  /** Makes the next import reload the custom field catalog (used by manual synchronization). */
  invalidateFieldCatalog() {
    this.fieldCatalog = null;
  }

  private upsert(projectId: string, item: AzureWorkItem, catalog: CustomFieldCatalog) {
    const fields = item.fields;
    const azureCustomFields = Object.fromEntries(catalog.names
      .filter((fieldName) => fields[fieldName] !== undefined)
      .map((fieldName) => [fieldName, fields[fieldName]]));
    const actualHoursValue = fields['Microsoft.VSTS.Scheduling.CompletedWork'];
    const actualHours = typeof actualHoursValue === 'number' && Number.isFinite(actualHoursValue)
      ? actualHoursValue
      : null;
    const stringValue = (value: unknown, fallback: string | null = null) => {
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      return fallback;
    };
    const data = {
      parentExternalId: stringValue(fields['System.Parent']),
      type: stringValue(fields['System.WorkItemType'], 'Feature')!,
      title: stringValue(fields['System.Title'], `Work item ${item.id}`)!,
      state: stringValue(fields['System.State']),
      url: item.url,
      actualHours,
      azureCustomFields: azureCustomFields as Prisma.InputJsonObject,
    };
    return this.prisma.roadmapWorkItem.upsert({
      where: { projectId_externalId: { projectId, externalId: String(item.id) } },
      create: { projectId, externalId: String(item.id), ...data },
      update: data,
    });
  }

  /** Custom role/estimate fields shown in the plan; cached because the catalog is organization-wide. */
  private async customFields(credentials: AzureDevOpsCredentials, settings: Awaited<ReturnType<RoadmapIntegrationService['getSyncSettings']>>): Promise<CustomFieldCatalog> {
    if (this.fieldCatalog && Date.now() - this.fieldCatalog.loadedAt < FIELD_CATALOG_TTL_MS) return this.fieldCatalog;
    const fieldCatalog = await this.integration.requestJson<{ value: AzureWorkItemField[] }>(
      `${credentials.organizationUrl}/_apis/wit/fields?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    const explicit = new Set([
      ...settings.readRules.filter((rule) => rule.field !== 'auto').map((rule) => rule.field),
      settings.fact.field,
      ...settings.roleFields.flatMap((link) => [link.estimateField, link.aggregateField].filter((field): field is string => Boolean(field))),
    ]);
    const legacyAuto = settings.readRules.some((rule) => rule.field === 'auto') || settings.readRules.length === 0;
    this.fieldCatalog = {
      names: fieldCatalog.value
        .filter((field) => explicit.has(field.referenceName) || (legacyAuto && (field.isCustom || field.referenceName.startsWith('Custom.')) && /role|estimate/i.test(`${field.name ?? ''} ${field.referenceName}`)))
        .map((field) => field.referenceName),
      loadedAt: Date.now(),
    };
    return this.fieldCatalog;
  }
}
