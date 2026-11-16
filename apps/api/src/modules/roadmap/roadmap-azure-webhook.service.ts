import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
import { importWorkItemsRecorded } from './roadmap-import-health';

export type AzureWebhookPayload = {
  eventType?: string;
  resource?: { id?: number; workItemId?: number };
  resourceContainers?: { project?: { id?: string } };
};

const WEBHOOK_DEBOUNCE_MS = 1500;

/** Azure DevOps service hook events: imports changed work items in batches and handles deletions. */
@Injectable()
export class RoadmapAzureWebhookService {
  private readonly logger = new Logger(RoadmapAzureWebhookService.name);
  private readonly pendingImports = new Map<string, Set<number>>();
  private importTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
  ) {}

  async handleWebhook(payload: AzureWebhookPayload) {
    const projectExternalId = payload.resourceContainers?.project?.id;
    const eventType = payload.eventType ?? '';
    const workItemId =
      eventType === 'workitem.updated'
        ? payload.resource?.workItemId
        : payload.resource?.id;
    if (!projectExternalId || !workItemId || !eventType.startsWith('workitem.'))
      return { accepted: false };
    const project = await this.prisma.roadmapProject.findUnique({
      where: { externalId: projectExternalId },
      select: { id: true },
    });
    if (!project) return { accepted: false };

    await this.prisma.roadmapAzureProjectState.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, lastWebhookAt: new Date() },
      update: { lastWebhookAt: new Date() },
    });

    if (eventType === 'workitem.deleted') {
      await this.handleDeletedWorkItem(project.id, String(workItemId));
      return { accepted: true };
    }
    if (eventType === 'workitem.commented') return { accepted: false };

    // Bursts of events (bulk edits, our own pushes) are imported in one batch per project.
    const ids = this.pendingImports.get(project.id) ?? new Set<number>();
    ids.add(Number(workItemId));
    this.pendingImports.set(project.id, ids);
    this.importTimer ??= setTimeout(
      () => void this.flushWebhookImports(),
      WEBHOOK_DEBOUNCE_MS,
    );
    return { accepted: true };
  }

  private async flushWebhookImports() {
    this.importTimer = null;
    const batches = [...this.pendingImports.entries()];
    this.pendingImports.clear();
    for (const [projectId, ids] of batches) {
      try {
        const credentials = await this.integration.getCredentials();
        await importWorkItemsRecorded(
          this.prisma,
          this.importer,
          projectId,
          [...ids],
          credentials,
        );
      } catch (error) {
        this.logger.error(
          `Azure DevOps webhook import failed for project ${projectId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  private async handleDeletedWorkItem(projectId: string, externalId: string) {
    await this.prisma.roadmapAllocation.updateMany({
      where: { azureTaskId: externalId, workItem: { projectId } },
      data: {
        azureTaskId: null,
        azurePushedHours: null,
        azureSyncStatus: 'error',
        azureSyncError:
          'Задача удалена в Azure DevOps. Нажмите «Отправить снова», чтобы создать её заново.',
      },
    });
    const local = await this.prisma.roadmapWorkItem.findUnique({
      where: { projectId_externalId: { projectId, externalId } },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (!local) return;
    // Planned work keeps its allocations; only items without a plan are removed.
    if (local._count.allocations) {
      await this.prisma.roadmapWorkItem.update({
        where: { id: local.id },
        data: { state: 'Deleted' },
      });
    } else {
      await this.prisma.roadmapWorkItem.delete({ where: { id: local.id } });
    }
  }
}
