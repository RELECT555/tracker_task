import { z } from 'zod';

const tintSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();
const columnIdSchema = z.string().min(1).max(160).refine(
  (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
  'Invalid column identifier',
);

/** A complete, versioned snapshot of one user's table appearance across projects. */
export const roadmapTablePreferencesSchema = z.object({
  version: z.literal(1),
  density: z.enum(['standard', 'compact', 'comfortable']),
  fontSize: z.enum(['standard', 'small', 'large']),
  /** Base color the whole table scheme is derived from; null keeps the neutral look. */
  accentTint: tintSchema.default(null),
  /** How strongly the accent washes headers, epic rows, stripes and hovers. */
  tintStrength: z.enum(['soft', 'standard', 'strong']).default('standard'),
  /** Optional overrides: null derives the color from the accent. */
  headerTint: tintSchema,
  epicTint: tintSchema,
  stripedRows: z.boolean(),
  wrapTitles: z.boolean(),
  separators: z.enum(['standard', 'subtle', 'strong']),
  pinnedColumns: z.enum(['none', 'name', 'totals']),
  showFact: z.boolean(),
  showDelta: z.boolean(),
  /** Added after v1 shipped: preferences saved earlier have no value and fall back to off. */
  showFactProgress: z.boolean().default(false),
  showRoleDetails: z.boolean(),
  plannedRolesOnly: z.boolean(),
  /** Added after v1 shipped: off, an epic sums only its own features and child epics count on their own. */
  includeChildEpics: z.boolean().default(false),
  columnWidths: z.record(columnIdSchema, z.number().finite().min(80).max(2400))
    .refine((value) => Object.keys(value).length <= 500, 'Too many column widths'),
}).strict();

export type RoadmapTablePreferences = z.infer<typeof roadmapTablePreferencesSchema>;

/** Defaults: the graphite scheme (accent #64748b); the original uncolored table is the "no color" preset. */
export const DEFAULT_ROADMAP_TABLE_PREFERENCES: RoadmapTablePreferences = {
  version: 1,
  density: 'standard',
  fontSize: 'standard',
  accentTint: '#64748b',
  tintStrength: 'standard',
  headerTint: null,
  epicTint: null,
  stripedRows: false,
  wrapTitles: true,
  separators: 'standard',
  pinnedColumns: 'totals',
  showFact: true,
  showDelta: true,
  showFactProgress: false,
  showRoleDetails: true,
  plannedRolesOnly: true,
  includeChildEpics: false,
  columnWidths: {},
};
