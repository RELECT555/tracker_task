export type ColumnWidthConfig = {
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
};

export type RoadmapColumnWidths = Record<string, number>;

const STORAGE_PREFIX = 'tracker.roadmap.column-widths.v1:';

export function columnWidthsStorageKey(userId: string | null | undefined): string | null {
  return userId ? `${STORAGE_PREFIX}${encodeURIComponent(userId)}` : null;
}

export function parseColumnWidths(serialized: string | null): RoadmapColumnWidths {
  if (!serialized) return {};
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, width]) =>
      typeof width === 'number' && Number.isFinite(width) && width > 0,
    ));
  } catch {
    return {};
  }
}

export function resolveColumnWidth(width: number | undefined, config: ColumnWidthConfig): number {
  const candidate = typeof width === 'number' && Number.isFinite(width) ? width : config.defaultWidth;
  return Math.round(Math.min(config.maxWidth ?? Infinity, Math.max(config.minWidth, candidate)));
}

export function readColumnWidths(storage: Pick<Storage, 'getItem'> | null, key: string | null): RoadmapColumnWidths {
  if (!storage || !key) return {};
  try {
    return parseColumnWidths(storage.getItem(key));
  } catch {
    return {};
  }
}
