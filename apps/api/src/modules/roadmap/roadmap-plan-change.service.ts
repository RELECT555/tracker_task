import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  ALLOCATION_SNAPSHOT_SELECT,
  actionOf,
  clampLimit,
  decodeCursor,
  encodeCursor,
  refOf,
  snapshotOf,
  type AllocationRef,
  type AllocationSnapshot,
  type PlanChangeAction,
  type PlanChangeContext,
  type PlanChangeDto,
  type PlanChangeInput,
  type PlanChangeQuery,
  type PlanChangeSource,
} from './roadmap-plan-change';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads allocation state and writes plan change log rows. `read`, `record` and
 * `recordAfter` take the caller's transaction so the log is committed (or rolled
 * back) together with the change it describes; `list` serves the journal.
 */
@Injectable()
export class RoadmapPlanChangeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of a project's journal, newest first. A cursor from the previous page
   * continues strictly after its last entry, so entries sharing `createdAt` are
   * neither repeated nor skipped.
   */
  async list(
    projectId: string,
    query: PlanChangeQuery,
  ): Promise<{ items: PlanChangeDto[]; nextCursor: string | null }> {
    const limit = clampLimit(query.limit);
    const and: Prisma.RoadmapPlanChangeWhereInput[] = [];

    const created: Prisma.DateTimeFilter = {};
    if (query.from) created.gte = instant(query.from, 'from');
    if (query.to) {
      const end = instant(query.to, 'to');
      if (DATE_ONLY.test(query.to)) created.lt = new Date(+end + DAY_MS);
      else created.lte = end;
    }
    if (created.gte || created.lt || created.lte)
      and.push({ createdAt: created });

    if (query.personExternalId) {
      and.push({
        OR: [
          {
            before: {
              path: ['personExternalId'],
              equals: query.personExternalId,
            },
          },
          {
            after: {
              path: ['personExternalId'],
              equals: query.personExternalId,
            },
          },
        ],
      });
    }

    if (query.cursor) {
      const position = decodeCursor(query.cursor);
      if (!position) throw new BadRequestException('Некорректный курсор');
      and.push({
        OR: [
          { createdAt: { lt: position.createdAt } },
          { createdAt: position.createdAt, id: { lt: position.id } },
        ],
      });
    }

    const rows = await this.prisma.roadmapPlanChange.findMany({
      where: {
        projectId,
        ...(query.workItemExternalId
          ? { workItemExternalId: query.workItemExternalId }
          : {}),
        ...(and.length ? { AND: and } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    return {
      items: page.map(toDto),
      nextCursor:
        rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

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

    // Set here rather than by the column default: Postgres keeps microseconds, the list cursor
    // only carries milliseconds, and a row it cannot compare exactly would be skipped.
    const createdAt = new Date();
    const result = await tx.roadmapPlanChange.createMany({
      data: entries.map(({ change, action }) => ({
        createdAt,
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

  /**
   * Reads `allocationIds` after a write and records how each differs from `before`:
   * an id missing before was created, an id missing after was deleted.
   */
  async recordAfter(
    tx: Prisma.TransactionClient,
    context: PlanChangeContext,
    before: Map<string, { ref: AllocationRef; snapshot: AllocationSnapshot }>,
    allocationIds: string[],
    details?: Record<string, unknown>,
  ): Promise<number> {
    const after = await this.read(tx, allocationIds);
    const extra = details ? { details } : {};
    const changes: PlanChangeInput[] = [...after.values()].map(
      ({ ref, snapshot }) => ({
        ref,
        before: before.get(ref.allocationId)?.snapshot ?? null,
        after: snapshot,
        ...extra,
      }),
    );
    for (const id of new Set(allocationIds)) {
      const gone = before.get(id);
      if (gone && !after.has(id))
        changes.push({
          ref: gone.ref,
          before: gone.snapshot,
          after: null,
          ...extra,
        });
    }
    return this.record(tx, context, changes);
  }
}

function instant(value: string, name: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`Некорректная дата: ${name}`);
  return date;
}

function toDto(row: Prisma.RoadmapPlanChangeGetPayload<object>): PlanChangeDto {
  return {
    id: row.id,
    batchId: row.batchId,
    action: row.action as PlanChangeAction,
    source: row.source as PlanChangeSource,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    allocationId: row.allocationId,
    workItemId: row.workItemId,
    workItemExternalId: row.workItemExternalId,
    workItemTitle: row.workItemTitle,
    roleId: row.roleId,
    roleName: row.roleName,
    quarterKey: row.quarterKey,
    azureTaskId: row.azureTaskId,
    before: row.before as AllocationSnapshot | null,
    after: row.after as AllocationSnapshot | null,
    details: (row.details ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toJson(snapshot: AllocationSnapshot | null) {
  return snapshot
    ? (snapshot as unknown as Prisma.InputJsonObject)
    : Prisma.DbNull;
}
