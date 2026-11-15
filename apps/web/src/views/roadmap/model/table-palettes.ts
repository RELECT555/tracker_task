import type { CSSProperties } from 'react';
import type { RoadmapTablePreferences } from '@tracker/shared';

export type TablePaletteColors = {
  header: string;
  subheader: string;
  epic: string;
  epicHover: string;
  stripe: string;
  rowHover: string;
  footer: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
  surface: string;
};

export type TablePalette = {
  id: string;
  name: string;
  description: string;
  headerTint: string | null;
  epicTint: string | null;
  light: TablePaletteColors;
  dark: TablePaletteColors;
};

const base: TablePaletteColors = {
  header: 'color-mix(in srgb, var(--color-muted) 40%, var(--color-card))',
  subheader: 'color-mix(in srgb, var(--color-muted) 25%, var(--color-card))',
  epic: 'color-mix(in srgb, var(--color-muted) 30%, var(--color-card))',
  epicHover: 'color-mix(in srgb, var(--color-muted) 45%, var(--color-card))',
  stripe: 'color-mix(in srgb, var(--color-muted) 23%, var(--color-card))',
  rowHover: 'color-mix(in srgb, var(--color-muted) 15%, var(--color-card))',
  footer: 'color-mix(in srgb, var(--color-muted) 40%, var(--color-card))',
  border: 'var(--color-border)',
  accent: 'var(--color-primary)',
  text: 'var(--color-foreground)',
  muted: 'var(--color-muted-foreground)',
  surface: 'var(--color-card)',
};

/** Each scheme has its own surface hierarchy, rather than one transparent wash. */
export const TABLE_PALETTES: readonly TablePalette[] = [
  { id: 'base', name: 'Базовая', description: 'Исходное оформление', headerTint: null, epicTint: null, light: base, dark: base },
  {
    id: 'graphite', name: 'Графит', description: 'Спокойная и строгая', headerTint: '#475569', epicTint: '#64748b',
    light: { header: '#e7ebf0', subheader: '#f1f3f6', epic: '#f0f3f7', epicHover: '#e6ebf1', stripe: '#f8f9fb', rowHover: '#eff2f6', footer: '#e9edf2', border: '#cbd2dc', accent: '#52647b', text: '#26354a', muted: '#536176', surface: '#ffffff' },
    dark: { header: '#252b35', subheader: '#1c222c', epic: '#1c222b', epicHover: '#242c36', stripe: '#171c24', rowHover: '#222b36', footer: '#222a35', border: '#354151', accent: '#a7b5c9', text: '#e5ebf4', muted: '#b2bfd1', surface: '#141414' },
  },
  {
    id: 'cobalt', name: 'Кобальт', description: 'Чёткий синий акцент', headerTint: '#2458b8', epicTint: '#467cd4',
    light: { header: '#dfe9fb', subheader: '#eef3fd', epic: '#edf3ff', epicHover: '#dfeafe', stripe: '#f7f9ff', rowHover: '#edf3ff', footer: '#e7effd', border: '#c5d4ee', accent: '#3465bd', text: '#243d63', muted: '#4a6082', surface: '#ffffff' },
    dark: { header: '#1b2b47', subheader: '#182238', epic: '#19253a', epicHover: '#1e2c42', stripe: '#151d2b', rowHover: '#1d2c44', footer: '#1c2b43', border: '#314a6d', accent: '#8bb5ff', text: '#e2ecff', muted: '#b2c4e2', surface: '#141414' },
  },
  {
    id: 'turquoise', name: 'Бирюза', description: 'Свежая и сдержанная', headerTint: '#0f766e', epicTint: '#32998b',
    light: { header: '#dceeea', subheader: '#edf7f4', epic: '#edf7f4', epicHover: '#ddefe9', stripe: '#f6fbf9', rowHover: '#eaf5f1', footer: '#e2f0ec', border: '#bedbd2', accent: '#247f70', text: '#204c44', muted: '#466b63', surface: '#ffffff' },
    dark: { header: '#18322d', subheader: '#172824', epic: '#182a26', epicHover: '#1b302a', stripe: '#15211e', rowHover: '#1d302a', footer: '#1b302a', border: '#2c4c42', accent: '#7ecdb9', text: '#def4eb', muted: '#a8cbbd', surface: '#141414' },
  },
  {
    id: 'iris', name: 'Ирис', description: 'Мягкий фиолетовый', headerTint: '#7054aa', epicTint: '#9277c2',
    light: { header: '#eae3f7', subheader: '#f4f0fb', epic: '#f4f0fb', epicHover: '#eae2f7', stripe: '#faf8fd', rowHover: '#f0eafa', footer: '#eee8f8', border: '#d6c9e9', accent: '#7a5ab0', text: '#483360', muted: '#69567e', surface: '#ffffff' },
    dark: { header: '#2d243d', subheader: '#241e30', epic: '#271f33', epicHover: '#30263d', stripe: '#1f1a27', rowHover: '#2d243b', footer: '#2b2339', border: '#493957', accent: '#c2a4eb', text: '#eee5fb', muted: '#cab7df', surface: '#141414' },
  },
  {
    id: 'copper', name: 'Медь', description: 'Тёплая, без лишней яркости', headerTint: '#a45d38', epicTint: '#be805a',
    light: { header: '#f3e5da', subheader: '#faf2ec', epic: '#faf2ec', epicHover: '#f2e5da', stripe: '#fdf9f5', rowHover: '#f8eee6', footer: '#f5e9df', border: '#e2cdbd', accent: '#a56b44', text: '#5d3d29', muted: '#7d604b', surface: '#ffffff' },
    dark: { header: '#35281f', subheader: '#2a211b', epic: '#2b231c', epicHover: '#34281f', stripe: '#221c17', rowHover: '#30261e', footer: '#30261f', border: '#53402f', accent: '#dfaf83', text: '#f6e8da', muted: '#d7bba1', surface: '#141414' },
  },
];

export function getTablePalette(preferences: Pick<RoadmapTablePreferences, 'headerTint' | 'epicTint'>): TablePalette | undefined {
  const header = preferences.headerTint?.toLowerCase() ?? null;
  const epic = preferences.epicTint?.toLowerCase() ?? null;
  return TABLE_PALETTES.find((palette) => palette.headerTint === header && palette.epicTint === epic);
}

export function paletteVariables(palette: TablePalette): CSSProperties {
  const entries = (['light', 'dark'] as const).flatMap((mode) =>
    Object.entries(palette[mode]).map(([name, value]) => [
      `--roadmap-palette-${mode}-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]),
  );
  return Object.fromEntries(entries) as CSSProperties;
}

/** Preview and live table resolve the same authored colors for the active app theme. */
export function getPalettePreviewProps(palette: TablePalette) {
  return { className: 'roadmap-palette-preview', 'data-palette': palette.id, style: paletteVariables(palette) };
}
