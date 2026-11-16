import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { redactSecrets } from './roadmap-alert-format';
import type { AzureDevOpsCredentials } from './roadmap-integration.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

export type ImportOutcome =
  | { ok: true; changed: boolean; source: 'poll' | 'webhook' }
  | { ok: false; error: unknown };

const MAX_ERROR_LENGTH = 500;
const logger = new Logger('RoadmapImportHealth');

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown import error';
}

/**
 * Stores the result of an Azure DevOps import so that the health watchdog can
 * tell a failing project from a quiet one. Health bookkeeping never fails the
 * import itself.
 */
export async function recordImportOutcome(
  prisma: PrismaService,
  projectId: string,
  outcome: ImportOutcome,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (outcome.ok) {
      const stamps = {
        importFailingSince: null,
        lastImportOkAt: now,
        // Only polling stamps this; webhook imports never touch it.
        ...(outcome.changed && outcome.source === 'poll'
          ? { lastImportChangedAt: now }
          : {}),
      };
      await prisma.roadmapAzureProjectState.upsert({
        where: { projectId },
        create: { projectId, ...stamps },
        update: stamps,
      });
      return;
    }
    const failure = {
      lastImportFailedAt: now,
      lastImportError: redactSecrets(
        errorText(outcome.error),
        MAX_ERROR_LENGTH,
      ),
    };
    await prisma.roadmapAzureProjectState.upsert({
      where: { projectId },
      create: { projectId, importFailingSince: now, ...failure },
      update: failure,
    });
    // Conditional write keeps the earliest start when instances fail concurrently.
    await prisma.roadmapAzureProjectState.updateMany({
      where: { projectId, importFailingSince: null },
      data: { importFailingSince: now },
    });
  } catch (error) {
    logger.warn(
      `Could not record Azure import outcome for project ${projectId}: ${redactSecrets(errorText(error), MAX_ERROR_LENGTH)}`,
    );
  }
}

/**
 * Re-reads specific work items and records the outcome for import health.
 * These are targeted reads (after a write or a webhook), not polls, so a
 * success never counts as a poll that found changes. Errors are rethrown.
 */
export async function importWorkItemsRecorded(
  prisma: PrismaService,
  importer: RoadmapWorkItemImportService,
  projectId: string,
  ids: number[],
  credentials: AzureDevOpsCredentials,
) {
  try {
    const imported = await importer.importWorkItems(
      { id: projectId },
      ids,
      credentials,
    );
    await recordImportOutcome(prisma, projectId, {
      ok: true,
      changed: false,
      source: 'webhook',
    });
    return imported;
  } catch (error) {
    await recordImportOutcome(prisma, projectId, { ok: false, error });
    throw error;
  }
}
