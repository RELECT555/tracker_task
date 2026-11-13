import type { RoadmapMonthlyFact, RoadmapRole, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';

type RoleHours = Map<string, number>;

function addHours(totals: RoleHours, roleId: string, hours: number) {
  totals.set(roleId, (totals.get(roleId) ?? 0) + hours);
}

export function getRoadmapRoleFact(items: RoadmapWorkItem[], roles: RoadmapRole[], monthlyFact?: RoadmapMonthlyFact) {
  const byItem = new Map<string, RoleHours>();
  const byProject: RoleHours = new Map();
  const knownRoleIds = new Set(roles.map((role) => role.id));
  const itemsByExternalId = new Map(items.map((item) => [item.externalId, item]));
  const linksByTaskId = new Map<string, { roleId: string | null; monthlyHours?: number }>();

  for (const item of items) {
    for (const { id, roleId, azureTaskId } of item.allocations) {
      if (!azureTaskId || !knownRoleIds.has(roleId)) continue;
      const previous = linksByTaskId.get(azureTaskId);
      linksByTaskId.set(azureTaskId, {
        roleId: previous && previous.roleId !== roleId ? null : roleId,
        monthlyHours: previous?.monthlyHours ?? monthlyFact?.allocations[id],
      });
    }
  }

  for (const [taskId, link] of linksByTaskId) {
    const task = itemsByExternalId.get(taskId);
    if (task?.type.toLowerCase() !== 'task' || link.roleId === null) continue;
    const hours = monthlyFact ? link.monthlyHours ?? 0 : Number(task.actualHours ?? 0);
    if (!Number.isFinite(hours) || hours === 0) continue;

    // Follow Azure's current hierarchy, which can differ from the allocation's owner.
    let ancestor: RoadmapWorkItem | undefined = task;
    const visited = new Set<string>();
    let contributesToProject = false;
    while (ancestor && !visited.has(ancestor.externalId)) {
      visited.add(ancestor.externalId);
      const type = ancestor.type.toLowerCase();
      if (type === 'epic' || type === 'feature') {
        const totals = byItem.get(ancestor.id) ?? new Map<string, number>();
        addHours(totals, link.roleId, hours);
        byItem.set(ancestor.id, totals);
        contributesToProject = true;
      }
      ancestor = ancestor.parentExternalId ? itemsByExternalId.get(ancestor.parentExternalId) : undefined;
    }
    if (contributesToProject) addHours(byProject, link.roleId, hours);
  }

  return { byItem, byProject };
}
