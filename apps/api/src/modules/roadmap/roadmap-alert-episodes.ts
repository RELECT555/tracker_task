import { Prisma } from '@prisma/client';
import type {
  RoadmapAlertDetails,
  RoadmapAlertResolution,
} from '@tracker/shared';

type EpisodeDb = Pick<Prisma.TransactionClient, 'roadmapAlertEpisode'>;

/** The alert row an episode belongs to, at the generation being journaled. */
export interface EpisodeAlert {
  id: string;
  generation: number;
  kind: string;
  projectId: string | null;
  openedAt: Date;
}

const episodeKey = (alert: EpisodeAlert) => ({
  alertId_generation: { alertId: alert.id, generation: alert.generation },
});

function newEpisode(alert: EpisodeAlert, details: RoadmapAlertDetails) {
  return {
    alertId: alert.id,
    generation: alert.generation,
    kind: alert.kind,
    projectId: alert.projectId,
    openedAt: alert.openedAt,
    details: details as Prisma.InputJsonObject,
    peakCount: details.count ?? null,
  };
}

/** Starts the journal row for a freshly opened episode; a duplicate (same generation) is ignored. */
export async function createEpisode(
  db: EpisodeDb,
  alert: EpisodeAlert,
  details: RoadmapAlertDetails,
): Promise<void> {
  await db.roadmapAlertEpisode.createMany({
    data: [{ ...newEpisode(alert, details), openedCount: details.count ?? null }],
    skipDuplicates: true,
  });
}

/**
 * Records the latest details of an open episode and raises its peak count. Upserts, so an
 * alert opened before the journal existed gets its row (its opening count stays unknown).
 */
export async function touchEpisode(
  db: EpisodeDb,
  alert: EpisodeAlert,
  details: RoadmapAlertDetails,
): Promise<void> {
  await db.roadmapAlertEpisode.upsert({
    where: episodeKey(alert),
    create: newEpisode(alert, details),
    update: { details: details as Prisma.InputJsonObject },
  });
  const { count } = details;
  if (count === undefined) return;
  // Conditional write: concurrent refreshes can only ever raise the peak.
  await db.roadmapAlertEpisode.updateMany({
    where: {
      alertId: alert.id,
      generation: alert.generation,
      OR: [{ peakCount: null }, { peakCount: { lt: count } }],
    },
    data: { peakCount: count },
  });
}

/**
 * Closes the episode. `details` is only used when the row is missing (an alert opened
 * before the journal existed and never refreshed since).
 */
export async function closeEpisode(
  db: EpisodeDb,
  alert: EpisodeAlert & { details: RoadmapAlertDetails },
  resolution: RoadmapAlertResolution,
  endedAt: Date,
): Promise<void> {
  await db.roadmapAlertEpisode.upsert({
    where: episodeKey(alert),
    create: { ...newEpisode(alert, alert.details), resolvedAt: endedAt, resolution },
    update: { resolvedAt: endedAt, resolution },
  });
}
