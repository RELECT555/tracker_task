import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALLOCATION_SNAPSHOT_SELECT,
  actionOf,
  refOf,
  snapshotOf,
  type AllocationRef,
  type AllocationSnapshot,
  type PlanChangeContext,
  type PlanChangeInput,
} from './roadmap-plan-change';

/**
 * Reads allocation state and writes plan change log rows. Every method takes
 * the caller's transaction so the log is committed (or rolled back) together
 * with the change it describes.
 */
@Injectable()
export class RoadmapPlanChangeService {
  async read(
    tx: Prisma.TransactionClient,
    allocationIds: string[],
  ): Promise<
    Map<string, { ref: AllocationRef; snapshot: AllocationSnapshot }>
  > {
    const states = new Map<
      string,
      { ref: AllocationRef; snapshot: AllocationSnapshot }
    >();
    if (allocationIds.length === 0) return states;
    const rows = await tx.roadmapAllocation.findMany({
      where: { id: { in: allocationIds } },
      select: ALLOCATION_SNAPSHOT_SELECT,
    });
    for (const row of rows) {
      states.set(row.id, { ref: refOf(row), snapshot: snapshotOf(row) });
    }
    return states;
  }

  /** Writes one row per changed entry; returns how many rows were written. */
  async record(
    tx: Prisma.TransactionClient,
    context: PlanChangeContext,
    changes: PlanChangeInput[],
  ): Promise<number> {
    const entries = changes.flatMap((change) => {
      const action = actionOf(change.before, change.after);
      return action ? [{ change, action }] : [];
    });
    if (entries.length === 0) return 0;

    const { actor } = context;
    const user = actor
      ? await tx.user.findUnique({
          where: { id: actor.id },
          select: { fullName: true },
        })
      : null;

    const result = await tx.roadmapPlanChange.createMany({
      data: entries.map(({ change, action }) => ({
        projectId: change.ref.projectId,
        batchId: context.batchId,
        action,
        source: context.source,
        actorUserId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        actorName: user?.fullName ?? null,
        azureTaskId: change.ref.azureTaskId,
        allocationId: change.ref.allocationId,
        workItemId: change.ref.workItemId,
        workItemExternalId: change.ref.workItemExternalId,
        workItemTitle: change.ref.workItemTitle,
        roleId: change.ref.roleId,
        roleName: change.ref.roleName,
        quarterKey: (change.after ?? change.before)!.quarterKey,
        before: toJson(change.before),
        after: toJson(change.after),
        details: (change.details ?? {}) as Prisma.InputJsonObject,
      })),
    });
    return result.count;
  }
}

function toJson(snapshot: AllocationSnapshot | null) {
  return snapshot
    ? (snapshot as unknown as Prisma.InputJsonObject)
    : Prisma.DbNull;
}
