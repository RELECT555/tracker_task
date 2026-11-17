import { roadmapQuarterContains, roadmapQuarterScope, type RoadmapQuarterIterations } from './iteration';
import { getRoadmapRolePlan, type RoadmapMetricsItem, type RoadmapMetricsRole } from './role-plan';

export interface RoadmapSummaryOptions {
  quarterKey: string;
  monthKey?: string;
  monthlyFact?: {
    workItems: Record<string, number>;
    allocations: Record<string, number>;
    totalHours: number;
  };
  /**
   * Quarter view only: the monthly fact of each month of the quarter. A card with fact in any of them counts
   * as active, so the quarter never shows fewer cards than one of its months. Omitted while it is loading.
   */
  quarterFact?: { workItems: Record<string, number> }[];
  /**
   * Quarter view only: the Azure iterations (sprints) that make up the quarter. When given, the role hours written
   * in Azure count only for cards sitting in them, so a quarter does not repeat the estimates of every card.
   * Cards elsewhere count through their own assignments and fact. Omit it when Azure has no such iterations.
   */
  quarterIterations?: RoadmapQuarterIterations;
  plannedRolesOnly?: boolean;
  /** Roll child epics into their parent epic. Off by default: an epic counts only its own features. */
  includeChildEpics?: boolean;
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

export interface RoadmapSummary<Item extends RoadmapMetricsItem, Role extends RoadmapMetricsRole> extends RoadmapSummaryTotals {
  items: Item[];
  /** Epics and features with plan or fact in the period; an epic's plan and fact include its features'. */
  activeItemIds: Set<string>;
  visibleRoles: Role[];
  rolePlan: ReturnType<typeof getRoadmapRolePlan>;
}

/** `YYYY-MM` keys of the three months of a `YYYY-Qn` quarter; empty for a malformed key. */
export function roadmapQuarterMonthKeys(quarterKey: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
  if (!match) return [];
  const firstMonth = (Number(match[2]) - 1) * 3 + 1;
  return [0, 1, 2].map((offset) => `${match[1]}-${String(firstMonth + offset).padStart(2, '0')}`);
}

function finiteHours(value: number | string | null | undefined) {
  const hours = Number(value ?? 0);
  return Number.isFinite(hours) ? hours : 0;
}

function isPlanItem(item: RoadmapMetricsItem) {
  return ['epic', 'feature'].includes(item.type.toLowerCase());
}

/**
 * Root facts are already rolled up by the API, including descendants through intermediate cards.
 * Without `includeChildEpics` the API stops each roll-up at the nearest epic, so every epic is a root.
 */
export function getRoadmapFactRoots<Item extends RoadmapMetricsItem>(items: Item[], includeChildEpics = false) {
  const byExternalId = new Map(items.map((item) => [item.externalId, item]));
  return items.filter((item) => {
    if (!isPlanItem(item)) return false;
    if (!includeChildEpics && item.type.toLowerCase() === 'epic') return true;
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
export function getRoadmapSummary<Item extends RoadmapMetricsItem, Role extends RoadmapMetricsRole>(
  plan: { workItems: Item[]; roles: Role[] },
  options: RoadmapSummaryOptions,
): RoadmapSummary<Item, Role> {
  const { quarterKey, monthKey, monthlyFact, quarterFact, plannedRolesOnly = false, includeChildEpics = false } = options;
  const items = plan.workItems.map((item): Item => {
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
  // Same condition as the table's iteration filter: with sprints known but no card in any iteration, nothing is scoped.
  const quarterScope = monthKey ? { paths: [], scoped: false } : roadmapQuarterScope(options.quarterIterations);
  const quarterPaths = quarterScope.paths;
  const scopedToIterations = quarterScope.scoped && items.some((item) => isPlanItem(item) && item.iterationPath);
  const rolePlan = getRoadmapRolePlan(
    items,
    plan.roles,
    monthKey ? false : scopedToIterations ? (item) => roadmapQuarterContains(quarterPaths, item.iterationPath) : true,
    includeChildEpics,
  );
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
  // Cards count for the period only when they carry plan or fact in it; the item list itself stays complete
  // so unplanned cards can still be picked up and planned. In the quarter view the plan also includes the
  // role hours written in Azure DevOps (they carry no period), in a month only local assignments count.
  // The quarter's fact comes from its months: the cumulative fact shown in the quarter view has no period.
  const planHoursOf = (item: Item) => [...(rolePlan.byItem.get(item.id)?.values() ?? [])].reduce((sum, hours) => sum + hours, 0);
  const hasQuarterFact = (item: Item) => quarterFact?.some((month) => finiteHours(month.workItems[item.id]) !== 0) ?? false;
  const hasActivity = (item: Item) => item.allocations.length > 0
    || (monthKey ? finiteHours(item.actualHours) !== 0 : planHoursOf(item) > 0 || hasQuarterFact(item));
  const byExternalId = new Map(items.map((item) => [item.externalId, item]));
  const activeFeatures = items.filter((item) => item.type.toLowerCase() === 'feature' && hasActivity(item));
  const activeEpicIds = new Set(items.filter((item) => item.type.toLowerCase() === 'epic' && hasActivity(item)).map((item) => item.id));
  for (const feature of activeFeatures) {
    const visited = new Set([feature.externalId]);
    let ancestor = feature.parentExternalId ? byExternalId.get(feature.parentExternalId) : undefined;
    while (ancestor && !visited.has(ancestor.externalId)) {
      if (ancestor.type.toLowerCase() === 'epic') {
        activeEpicIds.add(ancestor.id);
        if (!includeChildEpics) break;
      }
      visited.add(ancestor.externalId);
      ancestor = ancestor.parentExternalId ? byExternalId.get(ancestor.parentExternalId) : undefined;
    }
  }
  const roleKeys = [...new Set(visibleRoles.map((role) => role.name.trim().replace(/\s+/g, ' ').toLowerCase()))];
  return {
    epics: activeEpicIds.size,
    features: activeFeatures.length,
    planHours: [...rolePlan.byProject.values()].reduce((sum, hours) => sum + hours, 0),
    actualHours: monthKey
      ? monthlyFact ? finiteHours(monthlyFact.totalHours) : null
      : getRoadmapFactRoots(items, includeChildEpics).reduce((sum, item) => sum + finiteHours(item.actualHours), 0),
    roles: visibleRoles.length,
    participants: participants.size,
    participantIds: [...participants],
    roleKeys,
    items,
    activeItemIds: new Set(items.filter((item) => isPlanItem(item) && hasActivity(item)).map((item) => item.id)),
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

export type RoadmapSummaryMetrics = Omit<RoadmapSummaryTotals, 'roleKeys' | 'participantIds'>;

export interface RoadmapPortfolioInput {
  projectIds: string[];
  quarterKey: string;
  monthKey?: string;
  plannedRolesOnly?: boolean;
  includeMonthlyFact?: boolean;
  /** Quarter view only: load the fact of the quarter's months from Azure DevOps so cards with fact but no plan count. */
  includeQuarterFact?: boolean;
  /** Roll child epics into their parent epic, for both plan and fact. Off by default. */
  includeChildEpics?: boolean;
}

export interface RoadmapProjectOverview {
  metrics: RoadmapSummaryMetrics;
  canExpand: boolean;
}

export interface RoadmapPortfolio {
  projects: Record<string, RoadmapProjectOverview>;
  totals?: RoadmapSummaryMetrics;
  factIncomplete: boolean;
}

function summaryMetrics({ epics, features, planHours, actualHours, roles, participants }: RoadmapSummaryTotals): RoadmapSummaryMetrics {
  return { epics, features, planHours, actualHours, roles, participants };
}

export function buildRoadmapPortfolio(
  entries: { id: string; summary: RoadmapSummaryTotals & { rolePlan: { byUnattached: ReadonlyMap<string, number> } } }[],
  input: RoadmapPortfolioInput,
): RoadmapPortfolio {
  const summaries = entries.map(({ summary }) => summary);
  return {
    projects: Object.fromEntries(entries.map(({ id, summary }) => [id, {
      metrics: summaryMetrics(summary),
      canExpand: Boolean(summary.epics || summary.features || [...summary.rolePlan.byUnattached.values()].some((hours) => hours > 0)),
    }])),
    totals: entries.length === input.projectIds.length
      ? summaryMetrics(aggregateRoadmapSummaries(summaries))
      : undefined,
    factIncomplete: Boolean(input.monthKey && input.includeMonthlyFact !== false && summaries.some(({ actualHours }) => actualHours === null)),
  };
}
