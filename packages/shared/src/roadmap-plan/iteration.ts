export interface RoadmapIterationItem {
  id: string;
  externalId: string;
  type: string;
  parentExternalId: string | null;
  iterationPath?: string | null;
}

export interface RoadmapIterationVisibility {
  /** False when the quarter has no Azure iteration or the project has no stored iterations: everything is shown. */
  filtered: boolean;
  visibleIds: Set<string>;
  /** Visible only because of plan or fact in the period, while their iteration is another one. */
  outsideIds: Set<string>;
}

/** Classification paths start with "\", work item paths do not; Azure compares paths case-insensitively. */
function normalizePath(path: string | null | undefined) {
  return (path ?? '').trim().replace(/^\\+/, '').toLowerCase();
}

/** True when the item sits in the quarter's iteration or in any iteration nested under it. */
export function roadmapIterationContains(quarterPath: string, itemPath: string | null | undefined) {
  const quarter = normalizePath(quarterPath);
  const item = normalizePath(itemPath);
  return Boolean(quarter && item) && (item === quarter || item.startsWith(`${quarter}\\`));
}

/**
 * Which epics and features the plan table shows for a quarter. Cards of the quarter's iteration are shown;
 * other cards only when they carry plan or fact in the period, so the rows always add up to the totals.
 * An epic is also shown when one of its features is.
 */
export function getRoadmapIterationVisibility(
  items: RoadmapIterationItem[],
  quarterIterationPath: string | null,
  activeItemIds: ReadonlySet<string>,
  /** External ids of cards just created from the plan: Azure puts them at its default iteration, so keep them in view. */
  keptExternalIds: ReadonlySet<string> = new Set(),
  /** «Показать все карточки»: nothing is hidden, every card outside the quarter's iteration is marked. */
  showAll = false,
): RoadmapIterationVisibility {
  const typeOf = (item: RoadmapIterationItem) => item.type.toLowerCase();
  const planItems = items.filter((item) => typeOf(item) === 'epic' || typeOf(item) === 'feature');
  const visibleIds = new Set<string>();
  const outsideIds = new Set<string>();
  if (!quarterIterationPath || !planItems.some((item) => item.iterationPath)) {
    for (const item of planItems) visibleIds.add(item.id);
    return { filtered: false, visibleIds, outsideIds };
  }
  const inIteration = (item: RoadmapIterationItem) =>
    roadmapIterationContains(quarterIterationPath, item.iterationPath) || keptExternalIds.has(item.externalId);
  if (showAll) {
    for (const item of planItems) {
      visibleIds.add(item.id);
      if (!inIteration(item)) outsideIds.add(item.id);
    }
    return { filtered: true, visibleIds, outsideIds };
  }
  const place = (item: RoadmapIterationItem) => {
    if (inIteration(item)) visibleIds.add(item.id);
    else if (activeItemIds.has(item.id)) {
      visibleIds.add(item.id);
      outsideIds.add(item.id);
    }
  };
  const features = planItems.filter((item) => typeOf(item) === 'feature');
  features.forEach(place);
  const parentsOfVisible = new Set(features.filter((item) => visibleIds.has(item.id)).map((item) => item.parentExternalId));
  // An epic's activity is rolled up from its features, so a visible feature explains it: only an epic
  // shown without any of its features is marked.
  for (const epic of planItems.filter((item) => typeOf(item) === 'epic')) {
    if (parentsOfVisible.has(epic.externalId)) visibleIds.add(epic.id);
    else place(epic);
  }
  return { filtered: true, visibleIds, outsideIds };
}
