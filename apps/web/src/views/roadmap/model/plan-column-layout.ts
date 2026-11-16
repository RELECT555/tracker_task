export type PlanColumn = {
  id: string;
  label: string;
  width: number;
  minWidth: number;
  maxWidth?: number;
  grow?: boolean;
  customized?: boolean;
  /** Columns with the same group always share one width, e.g. plan, fact and delta of one role. */
  widthGroup?: string;
};

/**
 * A stored width was chosen for some container (often a wider one, e.g. focus mode). Shown in a narrower one,
 * a column never takes more than this share of it, so the columns after it stay on the first screen.
 */
export const MAX_COLUMN_SHARE = 0.75;
/** Pinned columns never cover more than this share of the container, leaving room for the columns that scroll. */
export const MAX_PINNED_SHARE = 0.6;

const columnCap = (availableWidth: number) => Math.round(availableWidth * MAX_COLUMN_SHARE);

/** Fits stored widths into the current container; the stored values themselves stay untouched. */
export function capStoredWidths(columns: PlanColumn[], availableWidth: number): PlanColumn[] {
  if (availableWidth <= 0) return columns;
  const cap = columnCap(availableWidth);
  return columns.map((column) => column.customized && column.width > cap
    ? { ...column, width: Math.max(column.minWidth, cap) }
    : column);
}

/** Spreads the leftover container width over the growable columns. */
export function fitColumns(columns: PlanColumn[], availableWidth: number): PlanColumn[] {
  let remaining = availableWidth - columns.reduce((total, column) => total + column.width, 0);
  // Prefer columns the user has not resized. When every growable column was
  // resized by hand (e.g. no role columns are visible), they still absorb the
  // leftover width so the table never stops short of its container.
  const untouched = columns.some((column) => column.grow && !column.customized);
  const canGrow = (column: PlanColumn) => column.grow && (!untouched || !column.customized);
  let weight = columns.filter(canGrow).reduce((total, column) => total + column.width, 0);
  return columns.map((column) => {
    if (!canGrow(column) || remaining <= 0) return column;
    const growth = Math.round(remaining * column.width / weight);
    remaining -= growth;
    weight -= column.width;
    return { ...column, width: column.width + growth };
  });
}

/** How much wider the pinned columns may still get; Infinity when nothing is pinned. */
export function pinnedSlack(columns: PlanColumn[], pinnedIds: readonly string[], availableWidth: number) {
  if (!pinnedIds.length || availableWidth <= 0) return Infinity;
  const pinnedWidth = columns.filter((column) => pinnedIds.includes(column.id)).reduce((total, column) => total + column.width, 0);
  return Math.max(0, Math.round(availableWidth * MAX_PINNED_SHARE) - pinnedWidth);
}

/**
 * Shrinks pinned columns that would cover too much of the container: growable ones (the name) first, then
 * the rest evenly, never below their minimum. Columns that do not scroll must not hide the ones that do.
 */
export function limitPinnedColumns(columns: PlanColumn[], pinnedIds: readonly string[], availableWidth: number): PlanColumn[] {
  if (!pinnedIds.length || availableWidth <= 0) return columns;
  const budget = Math.round(availableWidth * MAX_PINNED_SHARE);
  const widths = new Map(columns.filter((column) => pinnedIds.includes(column.id)).map((column) => [column.id, column.width]));
  let excess = [...widths.values()].reduce((total, width) => total + width, 0) - budget;
  if (excess <= 0) return columns;
  const pinned = columns.filter((column) => widths.has(column.id));
  for (const group of [pinned.filter((column) => column.grow), pinned.filter((column) => !column.grow)]) {
    // Even shares, repeated while a column stops at its minimum and leaves part of its share to the others.
    let open = group.filter((column) => widths.get(column.id)! > column.minWidth);
    while (excess > 0 && open.length) {
      const share = Math.ceil(excess / open.length);
      for (const column of open) {
        const width = widths.get(column.id)!;
        const cut = Math.min(share, excess, width - column.minWidth);
        widths.set(column.id, width - cut);
        excess -= cut;
      }
      open = open.filter((column) => widths.get(column.id)! > column.minWidth);
    }
  }
  return columns.map((column) => widths.has(column.id) ? { ...column, width: widths.get(column.id)! } : column);
}

/**
 * Columns resized together with `columnId` and how far its right edge moves per pixel of width: every
 * grouped column at or before it widens too, so the edge keeps up with the pointer only at 1 / that count.
 */
export function resizeGroup(columns: PlanColumn[], columnId: string) {
  const index = columns.findIndex((column) => column.id === columnId);
  const group = columns[index]?.widthGroup;
  if (index < 0 || !group) return { ids: index < 0 ? [] : [columnId], edgeFactor: 1 };
  const ids = columns.filter((column) => column.widthGroup === group).map((column) => column.id);
  return { ids, edgeFactor: columns.slice(0, index + 1).filter((column) => column.widthGroup === group).length };
}
