import type { FieldSource, WriteRule } from './schema';
import { renderSyncTemplate, unknownTemplateTokens, type TemplateContext } from './templates';

export type AzureFieldInfo = {
  referenceName: string;
  readOnly?: boolean;
  isIdentity?: boolean;
  isPicklist?: boolean;
  allowedValues?: string[];
  alwaysRequired?: boolean;
  defaultValue?: unknown;
};

export type WriteEvaluation = {
  values: Record<string, string | number | boolean>;
  warnings: string[];
};

export function evaluateWriteRules(
  rules: WriteRule[],
  context: TemplateContext & { estimate?: number; remaining?: number; assignee?: string | null; iterationPath?: string | null; parentAreaPath?: string | null },
  fields?: Map<string, AzureFieldInfo> | Record<string, AzureFieldInfo>,
  creating = true,
): WriteEvaluation {
  const values: Record<string, string | number | boolean> = {};
  const warnings: string[] = [];
  const fieldInfo = (name: string) => fields instanceof Map ? fields.get(name) : fields?.[name];
  for (const rule of rules) {
    if (!rule.enabled || (!creating && rule.apply === 'create')) continue;
    const metadata = fieldInfo(rule.targetField);
    if (metadata?.readOnly) { warnings.push(`${rule.targetField}: поле доступно только для чтения`); continue; }
    if (fields && !metadata) continue;
    const value = resolveSource(rule.source, context);
    if (value === undefined || value === null || value === '') continue;
    if (metadata?.isPicklist && metadata.allowedValues?.length && !metadata.allowedValues.includes(String(value))) {
      warnings.push(`${rule.targetField}: значение «${value}» отсутствует в списке допустимых`);
      continue;
    }
    values[rule.targetField] = value;
    if (rule.source.kind === 'template') {
      warnings.push(...unknownTemplateTokens(rule.source.template, context).map((token) => `${rule.targetField}: неизвестный токен {${token}}`));
    }
  }
  if (fields) {
    for (const metadata of Object.values(fields instanceof Map ? Object.fromEntries(fields) : fields)) {
      if (metadata.alwaysRequired && metadata.defaultValue === undefined && !values[metadata.referenceName]) warnings.push(`${metadata.referenceName}: обязательное поле не настроено`);
    }
  }
  return { values, warnings };
}

function resolveSource(source: FieldSource, context: TemplateContext & { estimate?: number; remaining?: number; assignee?: string | null; iterationPath?: string | null; parentAreaPath?: string | null }) {
  if (source.kind === 'constant') return source.value;
  if (source.kind === 'template') return renderSyncTemplate(source.template, context);
  if (source.kind === 'parentField') return context.fields?.[source.field] as string | number | boolean | undefined;
  if (source.kind === 'byRole') return source.values[context.role] ?? source.fallback;
  const values: Record<string, unknown> = {
    estimate: context.estimate,
    remaining: context.remaining,
    assignee: context.assignee ?? context.personEmail ?? context.person,
    roleName: context.role,
    quarterKey: context.quarterKey,
    quarterStart: context.quarterStart,
    quarterEnd: context.quarterEnd,
    iterationPath: context.iterationPath,
    parentAreaPath: context.parentAreaPath,
  };
  return values[source.value] as string | number | boolean | undefined;
}
