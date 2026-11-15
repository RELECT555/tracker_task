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
  headerTint: tintSchema,
  epicTint: tintSchema,
  stripedRows: z.boolean(),
  wrapTitles: z.boolean(),
  separators: z.enum(['standard', 'subtle', 'strong']),
  pinnedColumns: z.enum(['none', 'name', 'totals']),
  showFact: z.boolean(),
  showDelta: z.boolean(),
  showRoleDetails: z.boolean(),
  plannedRolesOnly: z.boolean(),
  columnWidths: z.record(columnIdSchema, z.number().finite().min(80).max(2400))
    .refine((value) => Object.keys(value).length <= 500, 'Too many column widths'),
}).strict();

export type RoadmapTablePreferences = z.infer<typeof roadmapTablePreferencesSchema>;

/** Keep these defaults aligned with the original roadmap table presentation. */
export const DEFAULT_ROADMAP_TABLE_PREFERENCES: RoadmapTablePreferences = {
  version: 1,
  density: 'standard',
  fontSize: 'standard',
  headerTint: null,
  epicTint: null,
  stripedRows: false,
  wrapTitles: true,
  separators: 'standard',
  pinnedColumns: 'name',
  showFact: true,
  showDelta: true,
  showRoleDetails: true,
  plannedRolesOnly: true,
  columnWidths: {},
};
