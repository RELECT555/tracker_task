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
 * The iterations that make up a quarter: either one iteration named after it, or, when a team plans in
 * monthly or two-week sprints, every sprint that falls inside it. Accepts one path or a list; an object adds
 * `scoped`: the project plans by iteration, so a quarter with no iteration of its own is empty, not unknown
 * (a bare list or path is scoped only when it is not empty, as before).
 */
export type RoadmapQuarterIterations =
  | string
  | readonly string[]
  | null
  | undefined
  | { paths: readonly string[]; scoped?: boolean };

function cleanPaths(list: readonly string[]) {
  return list.map((path) => path.trim()).filter(Boolean);
}

/** The quarter's iteration paths and whether the plan is scoped to them at all. */
export function roadmapQuarterScope(value: RoadmapQuarterIterations): { paths: string[]; scoped: boolean } {
  if (value && typeof value === 'object' && 'paths' in value) {
    const paths = cleanPaths(value.paths);
    return { paths, scoped: value.scoped ?? paths.length > 0 };
  }
  const paths = cleanPaths(typeof value === 'string' ? [value] : Array.from(value ?? []));
  return { paths, scoped: paths.length > 0 };
}

export function roadmapQuarterIterationPaths(value: RoadmapQuarterIterations): string[] {
  return roadmapQuarterScope(value).paths;
}

/** True when the item sits in any of the quarter's iterations or under one of them. */
export function roadmapQuarterContains(value: RoadmapQuarterIterations, itemPath: string | null | undefined) {
  return roadmapQuarterIterationPaths(value).some((path) => roadmapIterationContains(path, itemPath));
}

/**
 * Which epics and features the plan table shows for a quarter. Cards of the quarter's iteration are shown;
 * other cards only when they carry plan or fact in the period, so the rows always add up to the totals.
 * An epic is also shown when one of its features is.
 */
export function getRoadmapIterationVisibility(
  items: RoadmapIterationItem[],
  quarterIterations: RoadmapQuarterIterations,
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
  const { paths, scoped } = roadmapQuarterScope(quarterIterations);
  if (!scoped || !planItems.some((item) => item.iterationPath)) {
    for (const item of planItems) visibleIds.add(item.id);
    return { filtered: false, visibleIds, outsideIds };
  }
  const inIteration = (item: RoadmapIterationItem) =>
    roadmapQuarterContains(paths, item.iterationPath) || keptExternalIds.has(item.externalId);
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
