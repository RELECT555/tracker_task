import type { RoadmapTablePreferences } from '@tracker/shared';
import { accentVariables, effectiveAccent } from './table-palettes';

/** Without an accent the base values add no visual overrides to the existing tables. */
export function getTableAppearanceProps(preferences: RoadmapTablePreferences) {
  return {
    className: 'roadmap-table-appearance',
    'data-accent': String(effectiveAccent(preferences) !== null),
    'data-density': preferences.density,
    'data-font-size': preferences.fontSize,
    'data-striped': String(preferences.stripedRows),
    'data-wrap': String(preferences.wrapTitles),
    'data-separators': preferences.separators,
    style: accentVariables(preferences),
  };
}
