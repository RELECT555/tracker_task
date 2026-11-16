export type RoadmapHierarchyItem = {
  id: string;
  externalId: string;
  parentExternalId: string | null;
  type: string;
};

export type RoadmapFactItem = RoadmapHierarchyItem & {
  allocations: { id: string; azureTaskId: string | null }[];
};

export function isPlanItem(item: RoadmapHierarchyItem) {
  return ['epic', 'feature'].includes(item.type.toLowerCase());
}

export function isFactSource(item: RoadmapHierarchyItem) {
  return isPlanItem(item) || item.type.toLowerCase() === 'task';
}

export function rollUpActualHours<T extends RoadmapHierarchyItem>(
  items: T[],
  itemByExternalId: Map<string, T>,
  hoursOf: (item: T) => number,
  includeChildEpics = false,
) {
  const workItems = new Map<string, number>();
  let totalHours = 0;
  for (const item of items) {
    if (!isFactSource(item)) continue;
    const hours = hoursOf(item);
    if (!Number.isFinite(hours) || hours === 0) continue;

    let ancestor: T | undefined = item;
    const visited = new Set<string>();
    let contributesToPlan = false;
    // Эпик считает факт только по своим фичам: таски, привязанные прямо к эпику, не входят.
    let underFeature = false;
    while (ancestor && !visited.has(ancestor.externalId)) {
      visited.add(ancestor.externalId);
      if (ancestor.type.toLowerCase() === 'feature') underFeature = true;
      if (
        isPlanItem(ancestor) &&
        (underFeature || ancestor.type.toLowerCase() !== 'epic')
      ) {
        workItems.set(ancestor.id, (workItems.get(ancestor.id) ?? 0) + hours);
        contributesToPlan = true;
      }
      // Без настройки «Учитывать дочерние эпики» факт не поднимается выше ближайшего эпика.
      if (!includeChildEpics && ancestor.type.toLowerCase() === 'epic') break;
      ancestor = ancestor.parentExternalId
        ? itemByExternalId.get(ancestor.parentExternalId)
        : undefined;
    }
    if (contributesToPlan) totalHours += hours;
  }
  return { workItems, totalHours };
}
