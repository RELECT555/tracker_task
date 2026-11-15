import { z } from 'zod';

export const fieldSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('constant'), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ kind: z.literal('template'), template: z.string().max(500) }),
  z.object({ kind: z.literal('roadmap'), value: z.enum(['estimate', 'remaining', 'assignee', 'roleName', 'quarterKey', 'quarterStart', 'quarterEnd', 'iterationPath', 'parentAreaPath']) }),
  z.object({ kind: z.literal('parentField'), field: z.string().min(1).max(255) }),
  z.object({ kind: z.literal('byRole'), values: z.record(z.union([z.string(), z.number()])), fallback: z.union([z.string(), z.number()]).optional() }),
]);

export const writeRuleSchema = z.object({
  id: z.string().min(1),
  targetField: z.string().min(1),
  source: fieldSourceSchema,
  apply: z.enum(['create', 'always']),
  enabled: z.boolean(),
});

export const readRuleSchema = z.object({
  id: z.string().min(1),
  workItemTypes: z.array(z.string().min(1)),
  field: z.string().min(1),
  label: z.string().min(1),
  display: z.enum(['badge', 'column', 'hidden']),
});

export const factSourceSchema = z.object({
  field: z.string().min(1).default('Microsoft.VSTS.Scheduling.CompletedWork'),
  scope: z.enum(['roadmapTasks', 'allChildTasks']).default('roadmapTasks'),
  unlinkedTasks: z.enum(['featureOnly', 'byAssignee']).default('featureOnly'),
});

export const roleFieldLinkSchema = z.object({
  roleName: z.string().min(1),
  estimateField: z.string().min(1).optional(),
  aggregateField: z.string().min(1).optional(),
});

export const syncSettingsV2Schema = z.object({
  version: z.literal(2),
  mode: z.enum(['off', 'manual', 'auto']).default('off'),
  projectIds: z.array(z.string()).nullable().default(null),
  workItemType: z.string().min(1).default('Task'),
  titleTemplate: z.string().min(1).default('{role}: {title} ({quarter})'),
  tagsTemplate: z.string().default('Roadmap; Roadmap {quarterKey}; {role}'),
  writeRules: z.array(writeRuleSchema).default([]),
  readRules: z.array(readRuleSchema).default([]),
  fact: factSourceSchema.default({}),
  roleFields: z.array(roleFieldLinkSchema).default([]),
  writeFeatureAggregates: z.boolean().default(false),
  conflictPolicy: z.enum(['overwrite', 'skip-field', 'stop']).default('overwrite'),
  removalPolicy: z.object({ action: z.enum(['keep', 'set-state', 'delete']).default('delete'), state: z.string().optional() }).default({ action: 'delete' }),
  pushPermission: z.enum(['admins', 'planners']).default('planners'),
});

export type FieldSource = z.infer<typeof fieldSourceSchema>;
export type WriteRule = z.infer<typeof writeRuleSchema>;
export type ReadRule = z.infer<typeof readRuleSchema>;
export type FactSource = z.infer<typeof factSourceSchema>;
export type RoleFieldLink = z.infer<typeof roleFieldLinkSchema>;
export type SyncSettingsV2 = z.infer<typeof syncSettingsV2Schema>;

export type LegacyWriteBackSettings = {
  mode?: 'off' | 'manual' | 'auto';
  workItemType?: string;
  titleTemplate?: string;
  tagsTemplate?: string;
  fields?: {
    assignedTo?: boolean;
    originalEstimate?: boolean;
    remainingWork?: boolean;
    iteration?: boolean;
    areaPath?: boolean;
    description?: boolean;
  };
  remainingWorkPolicy?: 'recalculate' | 'create-only';
  projectIds?: string[] | null;
};

const legacyDefaults = {
  mode: 'off' as const,
  workItemType: 'Task',
  titleTemplate: '{role}: {title} ({quarter})',
  tagsTemplate: 'Roadmap; Roadmap {quarterKey}; {role}',
  fields: { assignedTo: true, originalEstimate: true, remainingWork: true, iteration: true, areaPath: true, description: true },
  remainingWorkPolicy: 'recalculate' as const,
  projectIds: null,
};

export function migrateWriteBackSettingsV1(stored: LegacyWriteBackSettings | undefined, legacyEnabled = false): SyncSettingsV2 {
  const source = { ...legacyDefaults, ...stored, fields: { ...legacyDefaults.fields, ...stored?.fields } };
  const rules: WriteRule[] = [
    ['assignedTo', 'System.AssignedTo', { kind: 'roadmap', value: 'assignee' }, 'always'],
    ['originalEstimate', 'Microsoft.VSTS.Scheduling.OriginalEstimate', { kind: 'roadmap', value: 'estimate' }, 'always'],
    ['remainingWork', 'Microsoft.VSTS.Scheduling.RemainingWork', { kind: 'roadmap', value: 'remaining' }, source.remainingWorkPolicy === 'create-only' ? 'create' : 'always'],
    ['iteration', 'System.IterationPath', { kind: 'roadmap', value: 'iterationPath' }, 'create'],
    ['areaPath', 'System.AreaPath', { kind: 'roadmap', value: 'parentAreaPath' }, 'create'],
    ['description', 'System.Description', { kind: 'template', template: 'Создано из Roadmap. Роль: {role}, квартал: {quarter}. Оценку и исполнителя меняйте в Roadmap.' }, 'create'],
  ].filter(([id]) => source.fields[id as keyof typeof source.fields])
    .map(([id, targetField, fieldSource, apply]) => ({ id: `v1-${id}`, targetField, source: fieldSource, apply, enabled: true } as WriteRule));
  return syncSettingsV2Schema.parse({
    version: 2,
    mode: legacyEnabled && !stored?.mode ? 'auto' : source.mode,
    workItemType: source.workItemType,
    titleTemplate: source.titleTemplate,
    tagsTemplate: source.tagsTemplate,
    projectIds: source.projectIds,
    writeRules: rules,
    readRules: [{ id: 'legacy-custom-role-estimate', workItemTypes: ['Feature', 'Epic'], field: 'auto', label: 'Кастомное поле роли или оценки', display: 'hidden' }],
  });
}

export function normalizeSyncSettings(stored: unknown, legacyEnabled = false): SyncSettingsV2 {
  if (stored && typeof stored === 'object' && 'version' in stored && (stored as { version?: unknown }).version === 2) {
    return syncSettingsV2Schema.parse(stored);
  }
  return migrateWriteBackSettingsV1(stored as LegacyWriteBackSettings | undefined, legacyEnabled);
}
