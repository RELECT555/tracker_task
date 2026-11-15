import type { CSSProperties } from 'react';
import type { RoadmapTablePreferences } from '@tracker/shared';
import { getTablePalette, paletteVariables } from './table-palettes';

/** Base values intentionally add no visual overrides to the existing tables. */
export function getTableAppearanceProps(preferences: RoadmapTablePreferences) {
  const palette = getTablePalette(preferences);
  return {
    className: 'roadmap-table-appearance',
    'data-palette': palette?.id ?? 'custom',
    'data-palette-preset': String(Boolean(palette && palette.id !== 'base')),
    'data-density': preferences.density,
    'data-font-size': preferences.fontSize,
    'data-striped': String(preferences.stripedRows),
    'data-wrap': String(preferences.wrapTitles),
    'data-separators': preferences.separators,
    'data-header-tint': String(preferences.headerTint !== null),
    'data-epic-tint': String(preferences.epicTint !== null),
    style: {
      ...(palette ? paletteVariables(palette) : {}),
      '--roadmap-header-tint': preferences.headerTint ?? undefined,
      '--roadmap-epic-tint': preferences.epicTint ?? undefined,
    } as CSSProperties,
  };
}
