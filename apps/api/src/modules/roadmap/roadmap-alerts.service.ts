import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type {
  RoadmapAlertDetails,
  RoadmapAlertResolution,
} from '@tracker/shared';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  closeEpisode,
  createEpisode,
  touchEpisode,
} from './roadmap-alert-episodes';
import { formatAlert } from './roadmap-alert-format';
import { resolveRecipients } from './roadmap-alert-recipients';
import {
  ALERT_CLEAR_DELAY_MS,
  ALERT_INTERVAL_MS,
  NOTIFICATION_RETENTION_DAYS,
  decideAlert,
  evaluateConditions,
  type AlertCondition,
  type AlertSnapshot,
  type HealthInput,
} from './roadmap-alert-rules';
import { RoadmapIntegrationService } from './roadmap-integration.service';

const TITLE_MAX = 200;
const BODY_MAX = 1000;
const DAY_MS = 24 * 60 * 60_000;

/** The alert columns an episode row copies. */
const episodeAlertSelect = {
  id: true,
  generation: true,
  kind: true,
  projectId: true,
  openedAt: true,
} as const;

interface StatusCountRow {
  project_id: string;
  azure_sync_status: string;
  count: number;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * Sync health watchdog (spec §5). Runs on every API instance: correctness comes from
 * conditional updateMany calls and unique indexes, not from a lock.
 */
@Injectable()
export class RoadmapAlertsService {
  private readonly logger = new Logger(RoadmapAlertsService.name);
  /** Server-local date of the last successful retention cleanup on this instance. */
  private lastCleanupDate: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
  ) {}

  @Interval(ALERT_INTERVAL_MS)
  async tick(): Promise<void> {
    try {
      await this.evaluate();
    } catch (error) {
      this.logger.error(
        `Sync health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async evaluate(now: Date = new Date()): Promise<void> {
    const input = await this.loadHealth(now);
    const stored = await this.prisma.roadmapAlert.findMany({
      select: { key: true, state: true, generation: true, clearSince: true },
    });
    const snapshots = new Map<string, AlertSnapshot>(
      stored.map((alert) => [
        alert.key,
        {
          state: alert.state === 'open' ? 'open' : 'resolved',
          generation: alert.generation,
          clearSince: alert.clearSince,
        },
      ]),
    );
    const openKeys = new Set(
      stored
        .filter((alert) => alert.state === 'open')
        .map((alert) => alert.key),
    );

    for (const condition of evaluateConditions(input, openKeys)) {
      try {
        await this.apply(snapshots.get(condition.key) ?? null, condition, now);
      } catch (error) {
        this.logger.error(
          `Sync health alert ${condition.key} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await this.cleanup(now);
  }

  async loadHealth(now: Date): Promise<HealthInput> {
    const [counts, projects, auth, settings, sync] = await Promise.all([
      this.prisma.$queryRaw<StatusCountRow[]>`
        SELECT wi.project_id, a.azure_sync_status, count(*)::int AS count
        FROM roadmap_allocations a
        JOIN roadmap_work_items wi ON wi.id = a.work_item_id
        WHERE a.azure_sync_status IN ('error', 'conflict')
        GROUP BY wi.project_id, a.azure_sync_status`,
      this.prisma.roadmapProject.findMany({
        where: { syncedAt: { not: null } },
        select: {
          id: true,
          name: true,
          azureState: {
            select: {
              importFailingSince: true,
              lastImportError: true,
              lastWebhookAt: true,
              lastImportChangedAt: true,
            },
          },
        },
      }),
      this.integration.getAuthHealth(),
      this.integration.getPublicSettings(),
      this.integration.getSyncSettings(),
    ]);

    const countOf = (projectId: string, status: string) =>
      Number(
        counts.find(
          (row) =>
            row.project_id === projectId && row.azure_sync_status === status,
        )?.count ?? 0,
      );

    return {
      now,
      integrationConfigured: settings.configured,
      auth,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        // Mirrors the write-back scope check in RoadmapAzureSyncService.
        writeBackEnabled:
          sync.mode !== 'off' &&
          (!sync.projectIds || sync.projectIds.includes(project.id)),
        errorCount: countOf(project.id, 'error'),
        conflictCount: countOf(project.id, 'conflict'),
        importFailingSince: project.azureState?.importFailingSince ?? null,
        lastImportError: project.azureState?.lastImportError ?? null,
        lastWebhookAt: project.azureState?.lastWebhookAt ?? null,
        lastImportChangedAt: project.azureState?.lastImportChangedAt ?? null,
      })),
    };
  }

  private async apply(
    current: AlertSnapshot | null,
    condition: AlertCondition,
    now: Date,
  ): Promise<void> {
    const action = decideAlert(current, condition, now);
    const { key } = condition;

    switch (action.type) {
      case 'none':
        return;
      case 'open':
        await this.open(condition, now, current !== null);
        return;
      case 'refresh':
        await this.refresh(condition);
        return;
      case 'start-clear':
        await this.prisma.roadmapAlert.updateMany({
          where: { key, state: 'open', clearSince: null },
          data: { clearSince: now },
        });
        return;
      case 'resolve':
        await this.resolve(key, action.resolution, now);
        return;
    }
  }

  /**
   * Stores the latest details on the open alert and journals them in its current episode.
   * Every instance's write may land (the peak count only ever rises), so the generation is
   * read in the same transaction as the write to journal the episode that was refreshed.
   */
  private async refresh(condition: AlertCondition): Promise<void> {
    const { key } = condition;
    const details = condition.details as Prisma.InputJsonObject;
    await this.prisma.$transaction(async (tx) => {
      const won = await tx.roadmapAlert.updateMany({
        where: { key, state: 'open' },
        data: { details, clearSince: null },
      });
      if (won.count !== 1) return;
      const alert = await tx.roadmapAlert.findUnique({
        where: { key },
        select: episodeAlertSelect,
      });
      if (!alert?.openedAt) return;
      await touchEpisode(
        tx,
        { ...alert, openedAt: alert.openedAt },
        condition.details,
      );
    });
  }

  /**
   * Closes the alert and its episode in one transaction. A `fixed` episode ends when the
   * condition actually went away (`clearSince`), not when the clear delay ran out.
   */
  private async resolve(
    key: string,
    resolution: RoadmapAlertResolution,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const alert = await tx.roadmapAlert.findUnique({
        where: { key },
        select: { ...episodeAlertSelect, clearSince: true, details: true },
      });
      if (!alert) return;
      // A `fixed` problem ends when the condition went away (`clearSince`), not when the
      // clear delay ran out. The alert and its episode share this time, so the page sorts
      // "Исправленные" by the same moment it shows.
      let endedAt = now;
      if (resolution === 'fixed') {
        if (alert.clearSince) {
          endedAt = alert.clearSince;
        } else {
          this.logger.warn(
            `Sync health alert ${key} resolved as fixed without clearSince; ending its episode now`,
          );
        }
      }
      const won = await tx.roadmapAlert.updateMany({
        where:
          resolution === 'fixed'
            ? {
                key,
                state: 'open',
                generation: alert.generation,
                // Another instance may have seen the problem again and reset the clock.
                clearSince: {
                  lte: new Date(now.getTime() - ALERT_CLEAR_DELAY_MS),
                },
              }
            : { key, state: 'open', generation: alert.generation },
        data: { state: 'resolved', resolvedAt: endedAt, resolution },
      });
      if (won.count !== 1) return;
      await closeEpisode(
        tx,
        {
          ...alert,
          openedAt: alert.openedAt ?? now,
          details: alert.details as RoadmapAlertDetails,
        },
        resolution,
        endedAt,
      );
    });
  }

  /**
   * Opens a new episode and notifies its recipients. Only the instance whose conditional
   * write succeeds creates notifications; the transaction rolls the episode back if they
   * cannot be written, so the next tick retries instead of leaving a silent episode.
   */
  private async open(
    condition: AlertCondition,
    now: Date,
    exists: boolean,
  ): Promise<void> {
    const { key, kind, projectId, projectName } = condition;
    const details = condition.details as Prisma.InputJsonObject;
    const episode = {
      state: 'open',
      openedAt: now,
      clearSince: null,
      resolvedAt: null,
      resolution: null,
      details,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        let alert: { id: string; generation: number } | null;
        if (exists) {
          const won = await tx.roadmapAlert.updateMany({
            where: { key, state: 'resolved' },
            data: { ...episode, generation: { increment: 1 } },
          });
          if (won.count !== 1) return;
          alert = await tx.roadmapAlert.findUnique({
            where: { key },
            select: { id: true, generation: true },
          });
          if (!alert) return;
        } else {
          alert = await tx.roadmapAlert.create({
            data: { ...episode, key, kind, projectId, generation: 1 },
            select: { id: true, generation: true },
          });
        }
        await createEpisode(
          tx,
          { ...alert, kind, projectId, openedAt: now },
          condition.details,
        );

        const { title, body } = formatAlert(
          kind,
          condition.details,
          projectName,
        );
        const recipients = await resolveRecipients(tx, kind, projectId);
        if (recipients.length === 0) return;
        await tx.roadmapNotification.createMany({
          data: recipients.map((userId) => ({
            userId,
            alertId: alert.id,
            generation: alert.generation,
            kind,
            projectId,
            title: title.slice(0, TITLE_MAX),
            body: body?.slice(0, BODY_MAX) ?? null,
          })),
          skipDuplicates: true,
        });
      });
    } catch (error) {
      // Another instance created this key first; it notifies the recipients.
      if (isUniqueViolation(error)) return;
      throw error;
    }
  }

  /**
   * Once per server-local day: drops old notifications and closed episodes, then closed
   * alerts left without either (so the cascade never erases episode history).
   */
  private async cleanup(now: Date): Promise<void> {
    const today = localDate(now);
    if (this.lastCleanupDate === today) return;
    const cutoff = new Date(
      now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS,
    );
    try {
      await this.prisma.roadmapNotification.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      await this.prisma.roadmapAlertEpisode.deleteMany({
        where: { resolvedAt: { lt: cutoff } },
      });
      await this.prisma.roadmapAlert.deleteMany({
        where: {
          state: 'resolved',
          notifications: { none: {} },
          episodes: { none: {} },
        },
      });
      this.lastCleanupDate = today;
    } catch (error) {
      this.logger.error(
        `Notification cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
