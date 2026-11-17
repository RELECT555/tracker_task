/** The fields required by the plan calculations in the browser and API. */
export interface RoadmapMetricsAllocation {
  id: string;
  roleId: string;
  personExternalId: string;
  quarterKey: string;
  estimatedHours: number | string;
  periods: { monthKey?: string | null; hours: number | string }[];
}

export interface RoadmapMetricsItem {
  id: string;
  externalId: string;
  parentExternalId: string | null;
  type: string;
  actualHours: number | string | null;
  azureCustomFields: Record<string, unknown> | null;
  /** Azure DevOps System.IterationPath; decides which quarter an Azure estimate belongs to. */
  iterationPath?: string | null;
  allocations: RoadmapMetricsAllocation[];
}

export interface RoadmapMetricsRole {
  id: string;
  name: string;
  azureEstimateField?: string | null;
  defaultPersonExternalId?: string | null;
  members?: { personExternalId: string; personIsActive: boolean }[];
}

type RoleHours = Map<string, number>;

export function azureRoleEstimate(item: RoadmapMetricsItem, role: RoadmapMetricsRole) {
  const value = role.azureEstimateField ? item.azureCustomFields?.[role.azureEstimateField] : undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

/**
 * Uses the same role totals for cells, collapsed epics, the project total and filtering.
 * Without `includeChildEpics` every epic is a root of its own: a parent epic sums only its own features,
 * and a child epic's plan counts once, in that epic and in the project total.
 *
 * `includeAzureEstimates` can be a predicate: the role hours written in Azure carry no period, so a quarter view
 * that knows its sprints counts them only for cards that sit in those sprints.
 */
export function getRoadmapRolePlan(
  items: RoadmapMetricsItem[],
  roles: RoadmapMetricsRole[],
  includeAzureEstimates: boolean | ((item: RoadmapMetricsItem) => boolean) = true,
  includeChildEpics = false,
) {
  const byItem = new Map<string, RoleHours>();
  const byProject: RoleHours = new Map();
  const byUnattached: RoleHours = new Map();
  const planItems = items.filter((item) => ['epic', 'feature'].includes(item.type.toLowerCase()));
  const planItemIds = new Set(planItems.map((item) => item.id));
  const knownRoleIds = new Set(roles.map((role) => role.id));
  const byExternalId = new Map(items.map((item) => [item.externalId, item]));
  const childrenById = new Map<string, RoadmapMetricsItem[]>();
  const localHoursByItem = new Map<string, RoleHours>();
  const explicitRolesByItem = new Map<string, Set<string>>();
  const roots: RoadmapMetricsItem[] = [];
  const parentPlanItem = (item: RoadmapMetricsItem) => {
    if (!includeChildEpics && item.type.toLowerCase() === 'epic') return undefined;
    let parent = item.parentExternalId ? byExternalId.get(item.parentExternalId) : undefined;
    const visited = new Set([item.externalId]);
    while (parent && !visited.has(parent.externalId) && !planItemIds.has(parent.id)) {
      visited.add(parent.externalId);
      parent = parent.parentExternalId ? byExternalId.get(parent.parentExternalId) : undefined;
    }
    return parent && !visited.has(parent.externalId) ? parent : undefined;
  };
  for (const item of planItems) {
    const parent = parentPlanItem(item);
    if (parent) {
      childrenById.set(parent.id, [...(childrenById.get(parent.id) ?? []), item]);
    } else {
      roots.push(item);
    }
  }
  // The API permits local assignments on Tasks and other non-Epic cards. Their
  // plans belong to the nearest visible parent; their custom Azure fields do not.
  for (const item of items) {
    const owner = planItemIds.has(item.id) ? item : parentPlanItem(item);
    const localHours = owner ? localHoursByItem.get(owner.id) ?? new Map<string, number>() : byUnattached;
    for (const allocation of item.allocations) {
      if (!knownRoleIds.has(allocation.roleId)) continue;
      const hours = Number(allocation.estimatedHours);
      localHours.set(allocation.roleId, (localHours.get(allocation.roleId) ?? 0)
        + (Number.isFinite(hours) && hours > 0 ? hours : 0));
    }
    if (owner) localHoursByItem.set(owner.id, localHours);
  }

  const aggregate = (item: RoadmapMetricsItem, visited = new Set<string>()): RoleHours => {
    const cached = byItem.get(item.id);
    if (cached) return cached;
    if (visited.has(item.id)) return new Map();
    const path = new Set([...visited, item.id]);
    const childTotals: RoleHours = new Map();
    const explicitRoles = new Set(localHoursByItem.get(item.id)?.keys());
    for (const child of childrenById.get(item.id) ?? []) {
      for (const [roleId, hours] of aggregate(child, path)) {
        childTotals.set(roleId, (childTotals.get(roleId) ?? 0) + hours);
      }
      for (const roleId of explicitRolesByItem.get(child.id) ?? []) explicitRoles.add(roleId);
    }
    const totals: RoleHours = new Map();
    const useAzure = typeof includeAzureEstimates === 'function' ? includeAzureEstimates(item) : includeAzureEstimates;
    for (const role of roles) {
      const localHours = localHoursByItem.get(item.id)?.get(role.id);
      const ownEstimate = useAzure ? azureRoleEstimate(item, role) : null;
      // Distinct local assignments are additive. Even an explicit zero replaces
      // the imported estimate and keeps that decision when rolling up ancestors.
      if (localHours !== undefined) totals.set(role.id, localHours + (childTotals.get(role.id) ?? 0));
      // Parent Azure estimates describe the whole card, so don't add them again to its children.
      // Azure's default zero fields are not a breakdown of a positive parent estimate.
      else if (childTotals.has(role.id) && (childTotals.get(role.id)! > 0 || explicitRoles.has(role.id) || ownEstimate === null)) totals.set(role.id, childTotals.get(role.id)!);
      else if (ownEstimate !== null) totals.set(role.id, ownEstimate);
    }
    byItem.set(item.id, totals);
    explicitRolesByItem.set(item.id, explicitRoles);
    return totals;
  };
  for (const item of planItems) aggregate(item);
  for (const root of roots) {
    for (const [roleId, hours] of byItem.get(root.id) ?? []) {
      byProject.set(roleId, (byProject.get(roleId) ?? 0) + hours);
    }
  }
  for (const [roleId, hours] of byUnattached) {
    byProject.set(roleId, (byProject.get(roleId) ?? 0) + hours);
  }
  return { byItem, byProject, byUnattached };
}
