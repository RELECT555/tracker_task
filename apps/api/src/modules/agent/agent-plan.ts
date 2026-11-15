export const QUARTER_KEY = /^(?!0000)\d{4}-Q[1-4]$/;

export interface SnapshotPeriod {
  monthKey: string | null;
  label: string;
  startsAt: string;
  endsAt: string;
  hours: number;
}

export interface SnapshotAllocation {
  id: string;
  roleId: string;
  personExternalId: string;
  personName: string;
  personEmail: string | null;
  quarterKey: string;
  estimatedHours: number;
  actualHours: number | null;
  periods: SnapshotPeriod[];
}

export interface SnapshotRole {
  id: string;
  name: string;
  members: {
    personExternalId: string;
    personName: string;
    personEmail: string | null;
    allocationPercent: number;
  }[];
}

export interface SnapshotItem {
  id: string;
  externalId: string;
  parentExternalId: string | null;
  type: string;
  title: string;
  state: string | null;
  actualHours: number;
  allocations: SnapshotAllocation[];
}

/** Compact, read-only copy of a project plan that the agent reasons over. */
export interface PlanSnapshot {
  projectName: string;
  roles: SnapshotRole[];
  items: SnapshotItem[];
}

export interface PlanInput {
  name: string;
  roles: {
    id: string;
    name: string;
    members?: {
      personExternalId: string;
      personName: string;
      personEmail: string | null;
      personIsActive: boolean;
      allocationPercent?: number;
    }[];
  }[];
  workItems: {
    id: string;
    externalId: string;
    parentExternalId: string | null;
    type: string;
    title: string;
    state: string | null;
    actualHours: unknown;
    allocations: {
      id: string;
      roleId: string;
      personExternalId: string;
      personName: string;
      personEmail: string | null;
      quarterKey: string;
      estimatedHours: unknown;
      actualHours?: unknown;
      periods: {
        monthKey: string | null;
        label: string;
        startsAt: Date;
        endsAt: Date;
        hours: unknown;
      }[];
    }[];
  }[];
}

export interface AgentProposal {
  allocationId: string | null;
  workItemId: string;
  workItemTitle: string;
  roleId: string;
  roleName: string;
  personExternalId: string;
  personName: string;
  quarterKey: string;
  fromHours: number | null;
  toHours: number;
  reason?: string;
}

export interface ChangeInput {
  workItemId: string;
  roleId: string;
  personExternalId: string;
  quarterKey: string;
  estimatedHours: number;
}

export function buildPlanSnapshot(plan: PlanInput): PlanSnapshot {
  return {
    projectName: plan.name,
    roles: plan.roles.map((role) => ({
      id: role.id,
      name: role.name,
      members: (role.members ?? [])
        .filter((member) => member.personIsActive)
        .map((member) => ({
          personExternalId: member.personExternalId,
          personName: member.personName,
          personEmail: member.personEmail,
          allocationPercent: member.allocationPercent ?? 100,
        })),
    })),
    items: plan.workItems.map((item) => ({
      id: item.id,
      externalId: item.externalId,
      parentExternalId: item.parentExternalId,
      type: item.type,
      title: item.title,
      state: item.state,
      actualHours: Number(item.actualHours ?? 0),
      allocations: item.allocations.map((allocation) => ({
        id: allocation.id,
        roleId: allocation.roleId,
        personExternalId: allocation.personExternalId,
        personName: allocation.personName,
        personEmail: allocation.personEmail,
        quarterKey: allocation.quarterKey,
        estimatedHours: Number(allocation.estimatedHours),
        actualHours:
          allocation.actualHours == null
            ? null
            : Number(allocation.actualHours),
        periods: allocation.periods.map((period) => ({
          monthKey: period.monthKey,
          label: period.label,
          startsAt: period.startsAt.toISOString(),
          endsAt: period.endsAt.toISOString(),
          hours: Number(period.hours),
        })),
      })),
    })),
  };
}

export type ChangeCheck =
  | { ok: true; proposal: AgentProposal; existing: SnapshotAllocation | null }
  | { ok: false; error: string };

/**
 * Checks one hours change against the plan. Used both when the agent proposes
 * a change and when the user applies it, so a forged proposal cannot skip it.
 */
export function checkChange(
  snapshot: PlanSnapshot,
  change: ChangeInput,
): ChangeCheck {
  const item = snapshot.items.find(({ id }) => id === change.workItemId);
  if (!item) return { ok: false, error: 'Задача не найдена в этом проекте' };
  if (item.type.toLowerCase() === 'epic')
    return { ok: false, error: 'На эпики нельзя назначать исполнителей' };

  const role = snapshot.roles.find(({ id }) => id === change.roleId);
  if (!role) return { ok: false, error: 'Роль не найдена в этом проекте' };

  const member = role.members.find(
    ({ personExternalId }) => personExternalId === change.personExternalId,
  );
  if (!member)
    return {
      ok: false,
      error: `${change.personExternalId} не является активным участником роли «${role.name}»`,
    };

  if (!QUARTER_KEY.test(change.quarterKey))
    return { ok: false, error: 'Квартал должен быть в формате YYYY-Qn' };

  const hours = Math.round(Number(change.estimatedHours) * 100) / 100;
  if (!Number.isFinite(hours) || hours < 0 || hours > 10_000)
    return { ok: false, error: 'Часы должны быть числом от 0 до 10000' };

  const existing =
    item.allocations.find(
      (allocation) =>
        allocation.roleId === change.roleId &&
        allocation.personExternalId === change.personExternalId &&
        allocation.quarterKey === change.quarterKey,
    ) ?? null;
  if (!existing && hours === 0)
    return {
      ok: false,
      error: 'Нечего менять: назначения нет, а часы равны 0',
    };

  return {
    ok: true,
    existing,
    proposal: {
      allocationId: existing?.id ?? null,
      workItemId: item.id,
      workItemTitle: item.title,
      roleId: role.id,
      roleName: role.name,
      personExternalId: member.personExternalId,
      personName: member.personName,
      quarterKey: change.quarterKey,
      fromHours: existing?.estimatedHours ?? null,
      toHours: hours,
    },
  };
}
