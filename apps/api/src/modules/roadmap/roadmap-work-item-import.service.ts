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
type CustomFieldCatalog = { names: string[]; labels: Map<string, string>; loadedAt: number };

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
    const catalog = await this.customFields(credentials);
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
      .map((fieldName) => [catalog.labels.get(fieldName) ?? fieldName, fields[fieldName]]));
    const actualHoursValue = fields['Microsoft.VSTS.Scheduling.CompletedWork'];
    const actualHours = typeof actualHoursValue === 'number' && Number.isFinite(actualHoursValue)
      ? actualHoursValue
      : null;
    const data = {
      parentExternalId: fields['System.Parent'] ? String(fields['System.Parent']) : null,
      type: String(fields['System.WorkItemType'] ?? 'Feature'),
      title: String(fields['System.Title'] ?? `Work item ${item.id}`),
      state: fields['System.State'] ? String(fields['System.State']) : null,
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
  private async customFields(credentials: AzureDevOpsCredentials): Promise<CustomFieldCatalog> {
    if (this.fieldCatalog && Date.now() - this.fieldCatalog.loadedAt < FIELD_CATALOG_TTL_MS) return this.fieldCatalog;
    const fieldCatalog = await this.integration.requestJson<{ value: AzureWorkItemField[] }>(
      `${credentials.organizationUrl}/_apis/wit/fields?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    this.fieldCatalog = {
      names: fieldCatalog.value
        .filter((field) => (field.isCustom || field.referenceName.startsWith('Custom.'))
          && /role|estimate/i.test(`${field.name ?? ''} ${field.referenceName}`))
        .map((field) => field.referenceName),
      labels: new Map(fieldCatalog.value.map((field) => [field.referenceName, field.name ?? field.referenceName])),
      loadedAt: Date.now(),
    };
    return this.fieldCatalog;
  }
}
