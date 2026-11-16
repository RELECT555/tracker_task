import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapAzureCatalogService } from './roadmap-azure-catalog.service';
import {
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
  type AzureDevOpsCredentials,
} from './roadmap-integration.service';
import { recordImportOutcome } from './roadmap-import-health';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { azureOrganizationName } from './roadmap-work-item-create.service';

type AzureProject = { id: string; name: string; url?: string; state?: string };
type AzureWorkItemRef = { id: number; url: string };
const WORK_ITEM_QUERY_PAGE_SIZE = 1_000;
const WORK_ITEM_QUERY_OVERLAP_MS = 60_000;
const AZURE_IMPORT_REQUEST_TIMEOUT_MS = 30_000;

/** Imports Azure DevOps projects and their work items (manually and every 5 minutes). */
@Injectable()
export class RoadmapProjectImportService {
  private readonly apiVersion = '7.1';
  private readonly logger = new Logger(RoadmapProjectImportService.name);
  private readonly projectImports = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
    private readonly catalog: RoadmapAzureCatalogService,
  ) {}

  async listAzureProjects() {
    const saved = await this.prisma.roadmapProject.findMany({
      select: { id: true, externalId: true, syncedAt: true },
    });
    const savedByExternalId = new Map(
      saved.map((project) => [project.externalId, project]),
    );
    try {
      const credentials = await this.integration.getCredentials();
      const projects: AzureProject[] = [];
      const query = new URLSearchParams({
        stateFilter: 'wellFormed',
        $top: '1000',
        'api-version': this.apiVersion,
      });
      const seenTokens = new Set<string>();
      let continuationToken: string | null;
      do {
        const response = await this.integration.request(
          `${credentials.organizationUrl}/_apis/projects?${query}`,
          undefined,
          credentials,
        );
        const page = (await response.json()) as { value: AzureProject[] };
        projects.push(...page.value);
        continuationToken = response.headers.get('x-ms-continuationtoken');
        if (continuationToken) {
          if (seenTokens.has(continuationToken))
            throw new BadGatewayException(
              'Azure DevOps repeated the projects page',
            );
          seenTokens.add(continuationToken);
          query.set('continuationToken', continuationToken);
        }
      } while (continuationToken);
      return {
        source: 'azure' as const,
        data: projects.map((project) => ({
          ...project,
          imported: savedByExternalId.has(project.id),
          roadmapId: savedByExternalId.get(project.id)?.id,
          planSynced: Boolean(savedByExternalId.get(project.id)?.syncedAt),
        })),
      };
    } catch (error) {
      const accessDenied =
        error instanceof AzureDevOpsHttpError &&
        (error.httpStatus === 401 || error.httpStatus === 403);
      if (!saved.length && !accessDenied) throw error;
      const localProjects = saved.length
        ? await this.prisma.roadmapProject.findMany({
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        source: 'cache' as const,
        azureError: accessDenied
          ? ('access-denied' as const)
          : ('unavailable' as const),
        data: localProjects.map((project) => ({
          id: project.externalId,
          name: project.name,
          url: project.url ?? undefined,
          imported: true,
          roadmapId: project.id,
          planSynced: Boolean(project.syncedAt),
        })),
      };
    }
  }

  async syncProject(externalId: string) {
    let projectId: string | undefined;
    try {
      const result = await this.runProjectImport(externalId, async () => {
        const credentials = await this.integration.getCredentials();
        const catalog = await this.catalog.syncProject(externalId, credentials);
        projectId = catalog.projectId;
        this.importer.invalidateFieldCatalog();
        const { importedCount } = await this.importProjectWorkItems(
          { id: catalog.projectId, externalId },
          credentials,
        );
        return { ...catalog, importedWorkItems: importedCount };
      });
      // A full re-import loads every card, so it says nothing about whether
      // Azure changed anything since the previous poll.
      await recordImportOutcome(this.prisma, result.projectId, {
        ok: true,
        changed: false,
        source: 'poll',
      });
      return result;
    } catch (error) {
      // The failure may come before the project is known (catalog sync).
      // The lookup must never mask the original import error.
      projectId ??= (
        await this.prisma.roadmapProject
          .findUnique({
            where: { externalId },
            select: { id: true },
          })
          .catch(() => null)
      )?.id;
      if (projectId)
        await recordImportOutcome(this.prisma, projectId, {
          ok: false,
          error,
        });
      throw error;
    }
  }

  @Cron('*/5 * * * *', { waitForCompletion: true })
  async refreshImportedProjects() {
    const projects = await this.prisma.roadmapProject.findMany({
      where: { syncedAt: { not: null } },
      select: { id: true, externalId: true, syncedAt: true, url: true },
    });
    if (
      !projects.length ||
      !(await this.integration.getPublicSettings()).configured
    )
      return;

    const credentials = await this.integration.getCredentials();
    const organization = azureOrganizationName(credentials.organizationUrl);
    for (const project of projects) {
      const projectOrganization = azureOrganizationName(project.url);
      if (
        this.projectImports.has(project.externalId) ||
        (projectOrganization && projectOrganization !== organization)
      )
        continue;
      try {
        const { changedCount } = await this.runProjectImport(
          project.externalId,
          () => this.importProjectWorkItems(project, credentials),
        );
        await recordImportOutcome(this.prisma, project.id, {
          ok: true,
          changed: changedCount > 0,
          source: 'poll',
        });
      } catch (error) {
        await recordImportOutcome(this.prisma, project.id, {
          ok: false,
          error,
        });
        const status =
          error instanceof AzureDevOpsHttpError
            ? ` (HTTP ${error.httpStatus})`
            : '';
        this.logger.warn(
          `Scheduled Azure DevOps import failed for project ${project.id}${status}`,
        );
      }
    }
  }

  private runProjectImport<T>(
    externalId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = this.projectImports.get(externalId);
    const pending = (
      previous ? previous.catch(() => undefined).then(run) : run()
    ).finally(() => {
      if (this.projectImports.get(externalId) === pending)
        this.projectImports.delete(externalId);
    });
    this.projectImports.set(externalId, pending);
    return pending;
  }

  private async importProjectWorkItems(
    project: { id: string; externalId: string; syncedAt?: Date | null },
    credentials: AzureDevOpsCredentials,
  ) {
    const startedAt = new Date();
    const changedSince =
      project.syncedAt &&
      new Date(project.syncedAt.getTime() - WORK_ITEM_QUERY_OVERLAP_MS);
    const changedFilter = changedSince
      ? ` AND [System.ChangedDate] >= '${changedSince.toISOString()}' AND [System.ChangedDate] < '${startedAt.toISOString()}'`
      : '';
    const endpoint = `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/wiql`;
    let importedCount = 0;
    // Cards Azure reported as changed since the last poll; the one-time
    // AssignedTo enrichment and full re-imports do not count.
    let changedCount = 0;
    let lastId = 0;
    const enrichedIds = new Set<number>();
    if (changedSince) {
      // Older imports did not store AssignedTo or the iteration. Enrich them once even
      // when the Azure card has not changed since the last incremental synchronization.
      const existing = await this.prisma.roadmapWorkItem.findMany({
        where: {
          projectId: project.id,
          type: { in: ['Epic', 'Feature', 'Task'] },
        },
        select: {
          externalId: true,
          azureCustomFields: true,
          iterationPath: true,
        },
      });
      const needsEnrichmentIds = existing
        .filter(
          (item) =>
            item.iterationPath === null ||
            !item.azureCustomFields ||
            typeof item.azureCustomFields !== 'object' ||
            !Object.prototype.hasOwnProperty.call(
              item.azureCustomFields,
              'System.AssignedTo',
            ),
        )
        .map((item) => Number(item.externalId))
        .filter((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647);
      if (needsEnrichmentIds.length) {
        const enriched = await this.importer.importWorkItems(
          project,
          needsEnrichmentIds,
          credentials,
          {
            requestTimeoutMs: AZURE_IMPORT_REQUEST_TIMEOUT_MS,
          },
        );
        for (const item of enriched) enrichedIds.add(item.id);
        importedCount += enriched.length;
        // Cards Azure no longer returns (deleted but kept for their plan, or unreadable) would stay
        // without an iteration and be requested again on every run. Mark them as checked: no iteration.
        const unreturned = existing
          .filter(
            (item) =>
              item.iterationPath === null &&
              !enrichedIds.has(Number(item.externalId)),
          )
          .map((item) => item.externalId);
        if (unreturned.length) {
          await this.prisma.roadmapWorkItem.updateMany({
            where: {
              projectId: project.id,
              externalId: { in: unreturned },
              iterationPath: null,
            },
            data: { iterationPath: '' },
          });
        }
      }
    }

    while (true) {
      const query =
        'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project' +
        changedFilter +
        ` AND [System.Id] > ${lastId} ORDER BY [System.Id]`;
      const { workItems } = await this.integration.requestJson<{
        workItems: AzureWorkItemRef[];
      }>(
        `${endpoint}?timePrecision=true&$top=${WORK_ITEM_QUERY_PAGE_SIZE}&api-version=${this.apiVersion}`,
        {
          method: 'POST',
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(AZURE_IMPORT_REQUEST_TIMEOUT_MS),
        },
        credentials,
      );
      const ids = workItems.map((item) => item.id);
      if (
        ids.some(
          (id, index) =>
            !Number.isSafeInteger(id) || id <= (ids[index - 1] ?? lastId),
        )
      ) {
        throw new BadGatewayException(
          'Azure DevOps returned out-of-order work item IDs',
        );
      }
      const imported = await this.importer.importWorkItems(
        project,
        ids.filter((id) => !enrichedIds.has(id)),
        credentials,
        {
          requestTimeoutMs: AZURE_IMPORT_REQUEST_TIMEOUT_MS,
          requireAll: Boolean(changedSince),
        },
      );
      importedCount += imported.length;
      if (changedSince) changedCount += imported.length;
      if (ids.length < WORK_ITEM_QUERY_PAGE_SIZE) break;
      lastId = ids[ids.length - 1];
    }

    // Advance only after all pages are saved. Use the start of the run so changes
    // arriving during the import are picked up by the next scheduled run.
    await this.prisma.roadmapProject.updateMany({
      where: {
        id: project.id,
        OR: [{ syncedAt: null }, { syncedAt: { lt: startedAt } }],
      },
      data: { syncedAt: startedAt },
    });
    return { importedCount, changedCount };
  }
}
