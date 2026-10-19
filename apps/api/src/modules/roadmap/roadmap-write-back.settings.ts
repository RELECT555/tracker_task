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

export type WriteBackTemplateValues = {
  role: string;
  title: string;
  quarterKey: string;
  person: string;
  id: string;
};

export function quarterLabel(quarterKey: string) {
  return quarterKey.replace(/^(\d{4})-(Q\d)$/, '$2 $1');
}

export function renderWriteBackTemplate(template: string, values: WriteBackTemplateValues) {
  const tokens: Record<string, string> = {
    role: values.role,
    title: values.title,
    quarter: quarterLabel(values.quarterKey),
    quarterKey: values.quarterKey,
    person: values.person,
    id: values.id,
  };
  return template.replace(/\{(\w+)\}/g, (match, token: string) => tokens[token] ?? match).trim();
}

export function renderWriteBackTags(template: string, values: WriteBackTemplateValues) {
  // Azure DevOps separates tags with ";", so a semicolon inside a value would split it.
  const safe = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.replace(/;/g, ',')])) as WriteBackTemplateValues;
  return renderWriteBackTemplate(template, safe)
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join('; ');
}

/** Merges stored settings with defaults; `writeBackEnabled: true` from the first version means automatic mode. */
export function normalizeWriteBackSettings(stored: Partial<WriteBackSettings> | undefined, legacyEnabled?: boolean): WriteBackSettings {
  return {
    ...DEFAULT_WRITE_BACK_SETTINGS,
    ...(legacyEnabled && !stored?.mode ? { mode: 'auto' as const } : {}),
    ...stored,
    fields: { ...DEFAULT_WRITE_BACK_SETTINGS.fields, ...stored?.fields },
  };
}
