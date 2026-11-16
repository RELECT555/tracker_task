import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export type PlanChangeSource = 'plan' | 'ai' | 'azure';
export type PlanChangeAction = 'created' | 'updated' | 'deleted';

export interface PlanChangeActor {
  id: string;
  email: string;
}

export interface PlanChangeContext {
  actor: PlanChangeActor | null;
  source: PlanChangeSource;
  batchId: string;
}

export interface AllocationSnapshot {
  personExternalId: string;
  personName: string;
  personEmail: string | null;
  quarterKey: string;
  estimatedHours: number;
  /** Only periods that have a monthKey, ascending by monthKey. */
  months: { monthKey: string; hours: number }[];
}

export interface AllocationRef {
  allocationId: string;
  projectId: string;
  workItemId: string;
  workItemExternalId: string;
  workItemTitle: string;
  roleId: string;
  roleName: string;
  azureTaskId: string | null;
}

export interface PlanChangeInput {
  ref: AllocationRef;
  before: AllocationSnapshot | null;
  after: AllocationSnapshot | null;
  details?: Record<string, unknown>;
}

/** Fields needed to build both the snapshot and the reference of an allocation. */
export const ALLOCATION_SNAPSHOT_SELECT = {
  id: true,
  personExternalId: true,
  personName: true,
  personEmail: true,
  quarterKey: true,
  estimatedHours: true,
  azureTaskId: true,
  workItem: {
    select: { id: true, externalId: true, title: true, projectId: true },
  },
  role: { select: { id: true, name: true } },
  periods: { select: { monthKey: true, hours: true } },
} satisfies Prisma.RoadmapAllocationSelect;

export type AllocationRow = Prisma.RoadmapAllocationGetPayload<{
  select: typeof ALLOCATION_SNAPSHOT_SELECT;
}>;

export function planChangeContext(
  actor: PlanChangeActor | null,
  source: PlanChangeSource,
  batchId: string = randomUUID(),
): PlanChangeContext {
  return { actor, source, batchId };
}

export function snapshotOf(row: AllocationRow): AllocationSnapshot {
  const months = row.periods
    .filter(
      (period): period is typeof period & { monthKey: string } =>
        period.monthKey !== null,
    )
    .map((period) => ({
      monthKey: period.monthKey,
      hours: Number(period.hours),
    }))
    .sort(compareMonths);
  return {
    personExternalId: row.personExternalId,
    personName: row.personName,
    personEmail: row.personEmail,
    quarterKey: row.quarterKey,
    estimatedHours: Number(row.estimatedHours),
    months,
  };
}

export function refOf(row: AllocationRow): AllocationRef {
  return {
    allocationId: row.id,
    projectId: row.workItem.projectId,
    workItemId: row.workItem.id,
    workItemExternalId: row.workItem.externalId,
    workItemTitle: row.workItem.title,
    roleId: row.role.id,
    roleName: row.role.name,
    azureTaskId: row.azureTaskId,
  };
}

export function sameSnapshot(
  a: AllocationSnapshot | null,
  b: AllocationSnapshot | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (
    a.personExternalId !== b.personExternalId ||
    a.personName !== b.personName ||
    a.personEmail !== b.personEmail ||
    a.quarterKey !== b.quarterKey ||
    a.estimatedHours !== b.estimatedHours ||
    a.months.length !== b.months.length
  ) {
    return false;
  }
  const left = [...a.months].sort(compareMonths);
  const right = [...b.months].sort(compareMonths);
  return left.every(
    (month, index) =>
      month.monthKey === right[index].monthKey &&
      month.hours === right[index].hours,
  );
}

/** null means there is nothing to record. */
export function actionOf(
  before: AllocationSnapshot | null,
  after: AllocationSnapshot | null,
): PlanChangeAction | null {
  if (before === null && after === null) return null;
  if (before === null) return 'created';
  if (after === null) return 'deleted';
  return sameSnapshot(before, after) ? null : 'updated';
}

function compareMonths(a: { monthKey: string }, b: { monthKey: string }) {
  return a.monthKey < b.monthKey ? -1 : a.monthKey > b.monthKey ? 1 : 0;
}
