import type { RoadmapMonthlyFact, RoadmapProjectPlan, RoadmapRole, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { getRoadmapRolePlan } from './roadmap-role-plan';

export interface RoadmapSummaryOptions {
  quarterKey: string;
  monthKey?: string;
  monthlyFact?: RoadmapMonthlyFact;
  plannedRolesOnly?: boolean;
}

export interface RoadmapSummaryTotals {
  epics: number;
  features: number;
  planHours: number;
  /** Quarter view shows cumulative fact; month view is unknown until its fact response arrives. */
  actualHours: number | null;
  roles: number;
  participants: number;
  roleKeys: string[];
  participantIds: string[];
}

export interface RoadmapSummary extends RoadmapSummaryTotals {
  items: RoadmapWorkItem[];
  visibleRoles: RoadmapRole[];
  rolePlan: ReturnType<typeof getRoadmapRolePlan>;
}

function finiteHours(value: number | string | null | undefined) {
  const hours = Number(value ?? 0);
  return Number.isFinite(hours) ? hours : 0;
}

function isPlanItem(item: RoadmapWorkItem) {
  return ['epic', 'feature'].includes(item.type.toLowerCase());
}

/** Root facts are already rolled up by the API, including descendants through intermediate cards. */
export function getRoadmapFactRoots(items: RoadmapWorkItem[]) {
  const byExternalId = new Map(items.map((item) => [item.externalId, item]));
  return items.filter((item) => {
    if (!isPlanItem(item)) return false;
    const visited = new Set([item.externalId]);
    let ancestor = item.parentExternalId ? byExternalId.get(item.parentExternalId) : undefined;
    while (ancestor && !visited.has(ancestor.externalId)) {
      if (isPlanItem(ancestor)) return false;
      visited.add(ancestor.externalId);
      ancestor = ancestor.parentExternalId ? byExternalId.get(ancestor.parentExternalId) : undefined;
    }
    return true;
  });
}

/** Shared period projection keeps project rows and the selected-project summary on the same basis. */
export function getRoadmapSummary(plan: RoadmapProjectPlan, options: RoadmapSummaryOptions): RoadmapSummary {
  const { quarterKey, monthKey, monthlyFact, plannedRolesOnly = false } = options;
  const items = plan.workItems.map((item): RoadmapWorkItem => {
    // Epic assignments are historical data; only descendant cards contribute to planning.
    const allocations = item.type.toLowerCase() === 'epic' ? [] : item.allocations;
    if (!monthKey) return { ...item, allocations: allocations.filter((allocation) => allocation.quarterKey === quarterKey) };
    return {
      ...item,
      actualHours: monthlyFact ? monthlyFact.workItems[item.id] ?? 0 : null,
      allocations: allocations.flatMap((allocation) => {
        // Older assignments can have monthly periods outside their original planning quarter.
        const periods = allocation.periods.filter((period) => period.monthKey === monthKey);
        const actualHours = monthlyFact?.allocations[allocation.id] ?? null;
        if (!periods.length && !actualHours) return [];
        return [{ ...allocation, periods, estimatedHours: periods.reduce((sum, period) => sum + finiteHours(period.hours), 0), actualHours }];
      }),
    };
  });
  const rolePlan = getRoadmapRolePlan(items, plan.roles, !monthKey);
  const visibleRoles = plannedRolesOnly
    ? plan.roles.filter((role) => (rolePlan.byProject.get(role.id) ?? 0) > 0)
    : plan.roles;
  const roleIds = new Set(visibleRoles.map((role) => role.id));
  const participants = new Set<string>();
  const addParticipant = (id?: string | null) => {
    if (id?.trim()) participants.add(id.trim());
  };
  for (const role of visibleRoles) {
    if (role.members) {
      for (const member of role.members) {
        if (member.personIsActive !== false) addParticipant(member.personExternalId);
      }
    } else {
      addParticipant(role.defaultPersonExternalId);
    }
  }
  for (const item of items) {
    for (const allocation of item.allocations) {
      if (roleIds.has(allocation.roleId)) addParticipant(allocation.personExternalId);
    }
  }
  const roleKeys = [...new Set(visibleRoles.map((role) => role.name.trim().replace(/\s+/g, ' ').toLowerCase()))];
  return {
    epics: items.filter((item) => item.type.toLowerCase() === 'epic').length,
    features: items.filter((item) => item.type.toLowerCase() === 'feature').length,
    planHours: [...rolePlan.byProject.values()].reduce((sum, hours) => sum + hours, 0),
    actualHours: monthKey
      ? monthlyFact ? finiteHours(monthlyFact.totalHours) : null
      : getRoadmapFactRoots(items).reduce((sum, item) => sum + finiteHours(item.actualHours), 0),
    roles: visibleRoles.length,
    participants: participants.size,
    participantIds: [...participants],
    roleKeys,
    items,
    visibleRoles,
    rolePlan,
  };
}

/** Project-specific IDs are kept separate; only stable people IDs and role names are deduplicated. */
export function aggregateRoadmapSummaries(summaries: RoadmapSummaryTotals[]): RoadmapSummaryTotals {
  const participantIds = [...new Set(summaries.flatMap((summary) => summary.participantIds))];
  const roleKeys = [...new Set(summaries.flatMap((summary) => summary.roleKeys))];
  return {
    epics: summaries.reduce((sum, summary) => sum + summary.epics, 0),
    features: summaries.reduce((sum, summary) => sum + summary.features, 0),
    planHours: summaries.reduce((sum, summary) => sum + summary.planHours, 0),
    actualHours: summaries.some((summary) => summary.actualHours === null)
      ? null
      : summaries.reduce((sum, summary) => sum + (summary.actualHours ?? 0), 0),
    roles: roleKeys.length,
    participants: participantIds.length,
    participantIds,
    roleKeys,
  };
}
