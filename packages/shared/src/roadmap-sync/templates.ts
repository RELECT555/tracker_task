import type { FieldSource } from './schema';

export type TemplateContext = {
  role: string;
  title: string;
  quarterKey: string;
  person: string;
  personEmail?: string | null;
  id: string;
  quarterStart?: string;
  quarterEnd?: string;
  epic?: string;
  fields?: Record<string, unknown>;
};

export function quarterLabel(quarterKey: string) {
  return quarterKey.replace(/^(\d{4})-(Q\d)$/, '$2 $1');
}

export function renderSyncTemplate(template: string, values: TemplateContext) {
  const tokens: Record<string, string> = {
    role: values.role,
    title: values.title,
    quarter: quarterLabel(values.quarterKey),
    quarterKey: values.quarterKey,
    person: values.person,
    personEmail: values.personEmail ?? '',
    quarterStart: values.quarterStart ?? '',
    quarterEnd: values.quarterEnd ?? '',
    epic: values.epic ?? '',
    id: values.id,
  };
  return template.replace(/\{field:([^}]+)\}|\{(\w+)\}/g, (match, field: string | undefined, token: string | undefined) => {
    if (field) return values.fields?.[field] === undefined ? match : String(values.fields[field]);
    return tokens[token ?? ''] ?? match;
  }).trim();
}

export function unknownTemplateTokens(template: string, values: TemplateContext) {
  const known = new Set(['role', 'title', 'quarter', 'quarterKey', 'person', 'personEmail', 'quarterStart', 'quarterEnd', 'epic', 'id']);
  return [...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).filter((token): token is string => Boolean(token && !known.has(token) && !token.startsWith('field:')));
}

export function renderSyncTags(template: string, values: TemplateContext) {
  const safe = { ...values, role: values.role.replace(/;/g, ','), title: values.title.replace(/;/g, ','), person: values.person.replace(/;/g, ',') };
  return renderSyncTemplate(template, safe).split(';').map((tag) => tag.trim()).filter(Boolean).join('; ');
}

export function sourceLabel(source: FieldSource) {
  if (source.kind === 'constant') return String(source.value);
  if (source.kind === 'template') return source.template;
  if (source.kind === 'roadmap') return source.value;
  if (source.kind === 'parentField') return `parent:${source.field}`;
  return source.fallback === undefined ? 'byRole' : `byRole (fallback: ${source.fallback})`;
}
