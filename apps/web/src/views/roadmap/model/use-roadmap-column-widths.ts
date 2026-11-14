'use client';

import { useCallback, useLayoutEffect, useState } from 'react';
import {
  columnWidthsStorageKey,
  parseColumnWidths,
  readColumnWidths,
  resolveColumnWidth,
  type ColumnWidthConfig,
  type RoadmapColumnWidths,
} from './roadmap-column-widths';

export type { ColumnWidthConfig } from './roadmap-column-widths';

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useRoadmapColumnWidths(userId: string | null | undefined) {
  const key = columnWidthsStorageKey(userId);
  const [snapshot, setSnapshot] = useState<{ key: string | null; widths: RoadmapColumnWidths }>({ key: null, widths: {} });
  // Never render the previous account's widths while the next account is loading.
  const widths = snapshot.key === key ? snapshot.widths : {};

  useLayoutEffect(() => {
    const storage = browserStorage();
    setSnapshot({ key, widths: readColumnWidths(storage, key) });
    const onStorage = (event: StorageEvent) => {
      if (storage && event.storageArea === storage && (event.key === key || event.key === null)) {
        setSnapshot({ key, widths: event.key === null ? {} : parseColumnWidths(event.newValue) });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const getWidth = (columnId: string, config: ColumnWidthConfig) => resolveColumnWidth(widths[columnId], config);

  const commitWidth = useCallback((columnId: string, width: number, config: ColumnWidthConfig) => {
    if (!key || !Number.isFinite(width)) return;
    const storage = browserStorage();
    const nextWidths = {
      ...(snapshot.key === key ? snapshot.widths : readColumnWidths(storage, key)),
      [columnId]: resolveColumnWidth(width, config),
    };
    setSnapshot({ key, widths: nextWidths });
    // Drag previews stay outside storage; write once after a completed resize.
    try {
      storage?.setItem(key, JSON.stringify(nextWidths));
    } catch {
      // Keep resizing usable when browser storage is disabled or full.
    }
  }, [key, snapshot]);

  const resetWidths = useCallback(() => {
    setSnapshot({ key, widths: {} });
    if (!key) return;
    try {
      browserStorage()?.removeItem(key);
    } catch {
      // The current page still resets if storage is unavailable.
    }
  }, [key]);

  const hasCustomWidth = (columnId: string) => Object.hasOwn(widths, columnId);

  const hasCustomWidths = Object.keys(widths).length > 0;

  return { getWidth, hasCustomWidth, hasCustomWidths, commitWidth, resetWidths };
}

export type ColumnWidthsApi = ReturnType<typeof useRoadmapColumnWidths>;
