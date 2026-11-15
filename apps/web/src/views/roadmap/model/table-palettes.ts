import type { CSSProperties } from 'react';
import type { RoadmapTablePreferences } from '@tracker/shared';

export type TableTintStrength = RoadmapTablePreferences['tintStrength'];

/** A preset is one accent color: the whole scheme (header, epics, stripes, hover, footer, borders) is derived from it in CSS. */
export type TablePalette = {
  id: string;
  name: string;
  description: string;
  accent: string | null;
};

export const TABLE_PALETTES: readonly TablePalette[] = [
  { id: 'graphite', name: 'Графит', description: 'Спокойная и строгая, по умолчанию', accent: '#64748b' },
  { id: 'sand', name: 'Песок', description: 'Тёплая нейтральная', accent: '#a38b5c' },
  { id: 'cobalt', name: 'Кобальт', description: 'Чёткий синий акцент', accent: '#2f6fe4' },
  { id: 'turquoise', name: 'Бирюза', description: 'Свежая и сдержанная', accent: '#0d9488' },
  { id: 'forest', name: 'Лес', description: 'Приглушённый зелёный', accent: '#3f8f5a' },
  { id: 'iris', name: 'Ирис', description: 'Мягкий фиолетовый', accent: '#7c5cdb' },
  { id: 'rose', name: 'Роза', description: 'Спокойный розовый', accent: '#d0487a' },
  { id: 'copper', name: 'Медь', description: 'Тёплая, без лишней яркости', accent: '#c2703d' },
  { id: 'none', name: 'Без цвета', description: 'Исходное оформление без акцента', accent: null },
];

export const TINT_STRENGTHS: readonly { value: TableTintStrength; label: string; factor: number }[] = [
  { value: 'soft', label: 'Лёгкая', factor: 0.55 },
  { value: 'standard', label: 'Обычная', factor: 1 },
  { value: 'strong', label: 'Яркая', factor: 1.7 },
];

type TintPrefs = Pick<RoadmapTablePreferences, 'accentTint' | 'headerTint' | 'epicTint'>;

/** Tables saved before accents existed only have header/epic colors; the first of them keeps coloring the table. */
export function effectiveAccent(preferences: TintPrefs): string | null {
  return preferences.accentTint ?? preferences.headerTint ?? preferences.epicTint;
}

/** The preset matching the current colors; undefined for a custom scheme (own accent or header/epic overrides). */
export function getTablePalette(preferences: TintPrefs): TablePalette | undefined {
  if (preferences.headerTint !== null || preferences.epicTint !== null) return undefined;
  const accent = preferences.accentTint?.toLowerCase() ?? null;
  return TABLE_PALETTES.find((palette) => palette.accent === accent);
}

export function tintFactor(strength: TableTintStrength) {
  return TINT_STRENGTHS.find((item) => item.value === strength)?.factor ?? 1;
}

export function accentVariables(preferences: TintPrefs & Pick<RoadmapTablePreferences, 'tintStrength'>): CSSProperties {
  return {
    '--roadmap-accent': effectiveAccent(preferences) ?? undefined,
    '--roadmap-header-color': preferences.headerTint ?? undefined,
    '--roadmap-epic-color': preferences.epicTint ?? undefined,
    '--roadmap-k': tintFactor(preferences.tintStrength),
  } as CSSProperties;
}

/** Preview and live table resolve the same derived colors for the active app theme. */
export function getPalettePreviewProps(palette: TablePalette, strength: TableTintStrength) {
  return {
    className: 'roadmap-palette-preview',
    'data-accent': String(palette.accent !== null),
    style: accentVariables({ accentTint: palette.accent, headerTint: null, epicTint: null, tintStrength: strength }),
  };
}
