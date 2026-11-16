import type { RoadmapMonthlyFact, RoadmapRole, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';

type RoleHours = Map<string, number>;

const ASSIGNED_TO = 'System.AssignedTo';

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function assigneeKeys(value: unknown) {
  if (typeof value === 'string') {
    const email = value.match(/<([^>]+)>/)?.[1];
    return { ids: [normalized(value)], email: normalized(email ?? (value.includes('@') ? value : '')) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ids: [], email: '' };
  const identity = value as Record<string, unknown>;
  return {
    ids: [normalized(identity.descriptor), normalized(identity.id)].filter(Boolean),
    email: normalized(identity.uniqueName ?? identity.mailAddress),
  };
}

function addHours(totals: RoleHours, roleId: string, hours: number) {
  totals.set(roleId, (totals.get(roleId) ?? 0) + hours);
}

/** Without `includeChildEpics` a task's fact stops at its nearest epic, matching the API's roll-up. */
export function getRoadmapRoleFact(items: RoadmapWorkItem[], roles: RoadmapRole[], monthlyFact?: RoadmapMonthlyFact, includeChildEpics = false) {
  const byItem = new Map<string, RoleHours>();
  const byProject: RoleHours = new Map();
  const itemsByExternalId = new Map(items.map((item) => [item.externalId, item]));
  const linksByTaskId = new Map<string, { roleId: string; personExternalId: string; personEmail: string | null; monthlyHours?: number }[]>();
  const membersByRole = new Map(roles.map((role) => [role.id, role.members ?? (role.defaultPersonExternalId ? [{
    personExternalId: role.defaultPersonExternalId,
    personEmail: role.defaultPersonEmail ?? null,
  }] : [])]));

  for (const item of items) {
    for (const { id, roleId, azureTaskId, personExternalId, personEmail } of item.allocations) {
      if (!azureTaskId || !membersByRole.has(roleId)) continue;
      linksByTaskId.set(azureTaskId, [...(linksByTaskId.get(azureTaskId) ?? []), {
        roleId, personExternalId, personEmail, monthlyHours: monthlyFact?.allocations[id],
      }]);
    }
  }

  for (const task of items) {
    const type = task.type.toLowerCase();
    if (!['epic', 'feature', 'task'].includes(type)) continue;
    const links = linksByTaskId.get(task.externalId) ?? [];
    const hasImportedAssignee = Object.hasOwn(task.azureCustomFields ?? {}, ASSIGNED_TO);
    const identity = assigneeKeys(task.azureCustomFields?.[ASSIGNED_TO]);
    const matches = (person: { personExternalId: string; personEmail: string | null }) =>
      identity.ids.includes(normalized(person.personExternalId))
      || Boolean(identity.email && identity.email === normalized(person.personEmail));
    const candidateRoles = new Set<string>();
    for (const [roleId, members] of membersByRole) {
      if (hasImportedAssignee ? members.some(matches) : members.some((member) => links.some((link) =>
        normalized(link.personExternalId) === normalized(member.personExternalId)))) candidateRoles.add(roleId);
    }
    // A current task/allocation link can disambiguate a person with several roles.
    // It cannot attribute a reassigned task to someone who is no longer in that role.
    const linkedRoles = new Set(links.filter((link) => candidateRoles.has(link.roleId)
      && (hasImportedAssignee ? matches(link) : true)).map((link) => link.roleId));
    const roleId = candidateRoles.size === 1 ? [...candidateRoles][0]
      : linkedRoles.size === 1 ? [...linkedRoles][0] : undefined;
    if (!roleId) continue;
    const hours = monthlyFact
      ? monthlyFact.sourceHours?.[task.externalId] ?? links.find((link) => link.monthlyHours !== undefined)?.monthlyHours ?? 0
      : Number(task.ownActualHours ?? (type === 'task' ? task.actualHours : 0));
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
        addHours(totals, roleId, hours);
        byItem.set(ancestor.id, totals);
        contributesToProject = true;
      }
      if (!includeChildEpics && type === 'epic') break;
      ancestor =ancestor.parentExternalId ? itemsByExternalId.get(ancestor.parentExternalId) : undefined;
    }
    if (contributesToProject) addHours(byProject, roleId, hours);
  }

  return { byItem, byProject };
}
