import {
  migrateWriteBackSettingsV1,
  normalizeSyncSettings,
  quarterLabel,
  renderSyncTags,
  renderSyncTemplate,
  type SyncSettingsV2,
  type TemplateContext,
  type WriteRule,
} from '@tracker/shared';

/**
 * How Roadmap writes the plan to Azure DevOps.
 * - off: nothing is written; plan changes are only remembered as `pending`.
 * - manual: plan changes are queued and sent when someone presses "Send to Azure".
 * - auto: every saved assignment is sent right away.
 */
export type WriteBackMode = 'off' | 'manual' | 'auto';

export type WriteBackSettings = {
  mode: WriteBackMode;
  /** Work item type Roadmap creates for each assignment. */
  workItemType: string;
  /** Tokens: {role} {title} {quarter} {quarterKey} {person} {id}. */
  titleTemplate: string;
  /** Semicolon-separated tags with the same tokens as the title. */
  tagsTemplate: string;
  fields: {
    assignedTo: boolean;
    originalEstimate: boolean;
    remainingWork: boolean;
    iteration: boolean;
    areaPath: boolean;
    description: boolean;
  };
  /** recalculate: Remaining Work = estimate − Completed Work on every estimate change; create-only: set once. */
  remainingWorkPolicy: 'recalculate' | 'create-only';
  /** Roadmap project ids that may be written; null means every imported project. */
  projectIds: string[] | null;
  /** v2 settings are kept alongside the v1-compatible projection during migration. */
  version?: 2;
  writeRules?: WriteRule[];
  readRules?: SyncSettingsV2['readRules'];
  fact?: SyncSettingsV2['fact'];
  roleFields?: SyncSettingsV2['roleFields'];
  writeFeatureAggregates?: boolean;
  conflictPolicy?: SyncSettingsV2['conflictPolicy'];
  removalPolicy?: SyncSettingsV2['removalPolicy'];
  pushPermission?: SyncSettingsV2['pushPermission'];
};

export const DEFAULT_WRITE_BACK_SETTINGS: WriteBackSettings = {
  mode: 'off',
  workItemType: 'Task',
  titleTemplate: '{role}: {title} ({quarter})',
  tagsTemplate: 'Roadmap; Roadmap {quarterKey}; {role}',
  fields: {
    assignedTo: true,
    originalEstimate: true,
    remainingWork: true,
    iteration: true,
    areaPath: true,
    description: true,
  },
  remainingWorkPolicy: 'recalculate',
  projectIds: null,
};

export type WriteBackTemplateValues = TemplateContext;

export { quarterLabel };

/** One renderer for every template: the same tokens work in the title, tags and field values. */
export function renderWriteBackTemplate(
  template: string,
  values: WriteBackTemplateValues,
) {
  return renderSyncTemplate(template, values);
}

/** Returns the individual tags; Azure DevOps separates them with ";", which renderSyncTags keeps out of values. */
export function renderWriteBackTags(
  template: string,
  values: WriteBackTemplateValues,
) {
  return renderSyncTags(template, values)
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Merges stored settings with defaults; `writeBackEnabled: true` from the first version means automatic mode. */
export function normalizeWriteBackSettings(
  stored: Partial<WriteBackSettings> | undefined,
  legacyEnabled?: boolean,
): WriteBackSettings {
  const v2 = normalizeSyncSettings(stored, legacyEnabled);
  const enabled = new Set(
    v2.writeRules
      .filter((rule) => rule.enabled)
      .map((rule) => rule.targetField),
  );
  const remainingRule = v2.writeRules.find(
    (rule) => rule.targetField === 'Microsoft.VSTS.Scheduling.RemainingWork',
  );
  return {
    ...DEFAULT_WRITE_BACK_SETTINGS,
    mode: v2.mode,
    workItemType: v2.workItemType,
    titleTemplate: v2.titleTemplate,
    tagsTemplate: v2.tagsTemplate,
    projectIds: v2.projectIds,
    fields: {
      assignedTo: enabled.has('System.AssignedTo'),
      originalEstimate: enabled.has(
        'Microsoft.VSTS.Scheduling.OriginalEstimate',
      ),
      remainingWork: enabled.has('Microsoft.VSTS.Scheduling.RemainingWork'),
      iteration: enabled.has('System.IterationPath'),
      areaPath: enabled.has('System.AreaPath'),
      description: enabled.has('System.Description'),
    },
    remainingWorkPolicy:
      remainingRule?.apply === 'create' ? 'create-only' : 'recalculate',
    version: 2,
    writeRules: v2.writeRules,
    readRules: v2.readRules,
    fact: v2.fact,
    roleFields: v2.roleFields,
    writeFeatureAggregates: v2.writeFeatureAggregates,
    conflictPolicy: v2.conflictPolicy,
    removalPolicy: v2.removalPolicy,
    pushPermission: v2.pushPermission,
  };
}

export function normalizeSyncWriteBackSettings(
  stored: unknown,
  legacyEnabled?: boolean,
) {
  return normalizeSyncSettings(stored, legacyEnabled);
}

/** Applies the basic settings form without rebuilding the advanced mapping. */
export function mergeBasicWriteBackSettings(
  current: SyncSettingsV2,
  input: WriteBackSettings,
): SyncSettingsV2 {
  const previous = normalizeWriteBackSettings(current);
  const defaults = migrateWriteBackSettingsV1(undefined);
  const enabledTargets = new Set(
    migrateWriteBackSettingsV1(input).writeRules.map(
      (rule) => rule.targetField,
    ),
  );
  const previousTargets = new Set(
    migrateWriteBackSettingsV1(previous).writeRules.map(
      (rule) => rule.targetField,
    ),
  );
  const writeRules = [...current.writeRules];

  for (const defaultRule of defaults.writeRules) {
    const { targetField } = defaultRule;
    const enabled = enabledTargets.has(targetField);
    const enableChanged = enabled !== previousTargets.has(targetField);
    const policyChanged =
      targetField === 'Microsoft.VSTS.Scheduling.RemainingWork' &&
      input.remainingWorkPolicy !== previous.remainingWorkPolicy;
    if (!enableChanged && !policyChanged) continue;

    const apply =
      input.remainingWorkPolicy === 'create-only' ? 'create' : 'always';
    let found = false;
    for (const [index, rule] of writeRules.entries()) {
      if (rule.targetField !== targetField) continue;
      found = true;
      writeRules[index] = {
        ...rule,
        enabled: enableChanged ? enabled : rule.enabled,
        apply: policyChanged ? apply : rule.apply,
      };
    }
    if (!found && enabled) {
      writeRules.push({
        ...defaultRule,
        apply: policyChanged ? apply : defaultRule.apply,
      });
    }
  }

  const { mode, workItemType, titleTemplate, tagsTemplate, projectIds } = input;
  return {
    ...current,
    mode,
    workItemType,
    titleTemplate,
    tagsTemplate,
    projectIds,
    writeRules,
  };
}

export { migrateWriteBackSettingsV1 };
