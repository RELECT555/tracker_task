'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { evaluateWriteRules, migrateWriteBackSettingsV1, renderSyncTags, renderSyncTemplate, unknownTemplateTokens, type WriteRule } from '@tracker/shared';
import type { RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { FLAT_INPUT, FLAT_OUTLINE, FieldSourcePicker, Panel, SaveBar, Section } from './parts';
import { PREVIEW_CONTEXT, TEMPLATE_TOKENS } from './template-tokens';
import { useAzureFields, useSyncSettingsEditor } from './useSyncSettingsEditor';
import { WriteRuleRow } from './WriteRuleEditor';

const KEYS = ['workItemType', 'titleTemplate', 'tagsTemplate', 'writeRules'] as const;
const DESCRIPTION_FIELD = 'System.Description';
const FIELD_LABEL = 'grid min-w-0 content-start gap-1.5 text-xs font-medium text-muted-foreground';
const MONO_INPUT = 'font-mono text-[13px]';

type Target = 'title' | 'description' | 'tags';

/** What the Task Roadmap creates for each assignment: title, description, tags and extra Azure fields, all in one place. */
export function TaskTemplatePanel({ overview }: { overview?: RoadmapWriteBackOverview }) {
  const formId = useId();
  const editor = useSyncSettingsEditor(KEYS);
  const { draft, update } = editor;
  const azure = useAzureFields(overview, draft?.workItemType);
  const titleRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [target, setTarget] = useState<Target>('title');

  const descriptionRule = draft?.writeRules.find((rule) => rule.targetField === DESCRIPTION_FIELD);
  const descriptionSource = descriptionRule?.enabled ? descriptionRule.source : undefined;
  // Only plain text can be edited here; a role- or parent-based value stays in "Поля Azure" untouched.
  const descriptionLocked = Boolean(descriptionSource && descriptionSource.kind !== 'template' && descriptionSource.kind !== 'constant');
  const descriptionText = descriptionSource?.kind === 'template' ? descriptionSource.template
    : descriptionSource?.kind === 'constant' ? String(descriptionSource.value) : '';
  const otherRules = draft?.writeRules.filter((rule) => rule.targetField !== DESCRIPTION_FIELD || descriptionLocked) ?? [];

  const setDescription = (text: string) => {
    if (!draft) return;
    if (!text.trim()) {
      update({ writeRules: draft.writeRules.map((rule) => rule.targetField === DESCRIPTION_FIELD ? { ...rule, enabled: false } : rule) });
      return;
    }
    const source = { kind: 'template' as const, template: text };
    update({
      writeRules: descriptionRule
        ? draft.writeRules.map((rule) => rule === descriptionRule ? { ...rule, source, enabled: true } : rule)
        : [...draft.writeRules, { id: 'tpl-description', targetField: DESCRIPTION_FIELD, source, apply: 'create', enabled: true }],
    });
  };

  const insertToken = (token: string) => {
    if (!draft) return;
    const input = { title: titleRef, description: descriptionRef, tags: tagsRef }[target].current;
    const value = target === 'title' ? draft.titleTemplate : target === 'tags' ? draft.tagsTemplate : descriptionText;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    if (target === 'title') update({ titleTemplate: next });
    else if (target === 'tags') update({ tagsTemplate: next });
    else setDescription(next);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
  };

  const preview = useMemo(() => {
    if (!draft) return null;
    const fieldInfo = azure.fields.length ? new Map(azure.fields.map((field) => [field.referenceName, field])) : undefined;
    const evaluation = evaluateWriteRules(draft.writeRules.filter((rule) => rule.targetField !== DESCRIPTION_FIELD || descriptionLocked), PREVIEW_CONTEXT, fieldInfo, true);
    const unknown = [draft.titleTemplate, draft.tagsTemplate, descriptionText].flatMap((text) => unknownTemplateTokens(text, PREVIEW_CONTEXT));
    return {
      title: renderSyncTemplate(draft.titleTemplate, PREVIEW_CONTEXT),
      tags: renderSyncTags(draft.tagsTemplate, PREVIEW_CONTEXT).split(';').map((tag) => tag.trim()).filter(Boolean),
      description: descriptionText ? renderSyncTemplate(descriptionText, PREVIEW_CONTEXT) : '',
      fields: Object.entries(evaluation.values).filter(([field]) => field !== DESCRIPTION_FIELD),
      warnings: [...new Set([...unknown.map((token) => `Неизвестная подстановка {${token}}`), ...evaluation.warnings])],
    };
  }, [draft, descriptionText, descriptionLocked, azure.fields]);

  const fieldName = (referenceName: string) => azure.fields.find((field) => field.referenceName === referenceName)?.name ?? referenceName;
  const addRule = () => {
    if (!draft) return;
    const free = azure.fields.find((field) => !field.readOnly && !draft.writeRules.some((rule) => rule.targetField === field.referenceName))
      ?? azure.fields.find((field) => !field.readOnly && field.isCustom);
    const rule: WriteRule = { id: `rule-${crypto.randomUUID()}`, targetField: free?.referenceName ?? 'Custom.Field', source: { kind: 'constant', value: '' }, apply: 'always', enabled: true };
    update({ writeRules: [...draft.writeRules, rule] });
  };

  return (
    <Panel title="Шаблон задачи" description="Так Roadmap создаёт задачу в Azure для каждого назначения. Менять нужно только то, что хотите видеть иначе: остальное заполнится само.">
      {!draft || !preview ? <p role="status" className="p-5 text-sm text-muted-foreground">Загружаем шаблон…</p> : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
          <fieldset disabled={editor.saving} aria-label="Шаблон задачи" className="min-w-0 divide-y divide-border">
            <Section title="Название, описание и теги" hint="Подстановки в фигурных скобках заменятся данными назначения. Нажмите на подстановку, чтобы вставить её в поле, где стоит курсор.">
              <div className="space-y-4">
                <label className={FIELD_LABEL}>
                  Название
                  <Input ref={titleRef} value={draft.titleTemplate} maxLength={200} onFocus={() => setTarget('title')} onChange={(event) => update({ titleTemplate: event.target.value })} className={cn(FLAT_INPUT, MONO_INPUT)} aria-invalid={!draft.titleTemplate.trim() || undefined} />
                  {!draft.titleTemplate.trim() ? <span role="alert" className="font-normal text-destructive">Без названия задачу создать нельзя.</span> : null}
                </label>
                <label className={FIELD_LABEL}>
                  Описание
                  <textarea
                    ref={descriptionRef}
                    id={`${formId}-description`}
                    rows={4}
                    maxLength={500}
                    value={descriptionText}
                    disabled={descriptionLocked}
                    onFocus={() => setTarget('description')}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Пусто — описание не заполняется"
                    className={cn('min-h-20 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50', MONO_INPUT)}
                  />
                  <span className="font-normal">{descriptionLocked ? 'Описание берётся из роли или фичи, оно настраивается ниже в «Полях Azure». ' : 'Пустая строка — новый абзац. Заполняется только при создании задачи. '}Не больше 500 знаков.</span>
                </label>
                <label className={FIELD_LABEL}>
                  Теги (через «;»)
                  <Input ref={tagsRef} value={draft.tagsTemplate} maxLength={200} onFocus={() => setTarget('tags')} onChange={(event) => update({ tagsTemplate: event.target.value })} className={cn(FLAT_INPUT, MONO_INPUT)} placeholder="Roadmap" />
                </label>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Вставить в {target === 'title' ? 'название' : target === 'tags' ? 'теги' : 'описание'}:</span>
                  {TEMPLATE_TOKENS.map(({ token, chip, example }) => (
                    <Button key={token} type="button" size="sm" variant="outline" onClick={() => insertToken(token)} className={cn(FLAT_OUTLINE, 'h-7 px-2 text-[11px]')} title={`${token}, например «${example}»`}>{chip}</Button>
                  ))}
                </div>
              </div>
            </Section>

            <Section
              title="Другие поля Azure"
              hint="Исполнитель, часы, итерация и команда заполняются по умолчанию. Здесь можно изменить это или добавить свои поля, например «Отдел» или «Тип работ»."
              action={<Button type="button" size="sm" variant="outline" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={addRule}><Plus aria-hidden="true" className="size-3.5" />Добавить поле</Button>}
            >
              <div className="space-y-3">
                <FieldSourcePicker projects={azure.projects} projectId={azure.projectId} onChange={azure.setProjectId} loading={azure.query.isFetching} onRefresh={() => void azure.query.refetch()} />
                {azure.query.isError ? <p role="alert" className="text-xs text-destructive">Не удалось загрузить поля из Azure. Названия полей можно ввести вручную.</p> : null}
                {otherRules.length ? otherRules.map((rule) => (
                  <WriteRuleRow
                    key={rule.id}
                    rule={rule}
                    fields={azure.fields}
                    onChange={(next) => update({ writeRules: draft.writeRules.map((item) => item.id === rule.id ? next : item) })}
                    onDelete={() => update({ writeRules: draft.writeRules.filter((item) => item.id !== rule.id) })}
                  />
                )) : <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Дополнительных полей нет. Добавьте поле, чтобы Roadmap заполнял его в задаче.</p>}
              </div>
            </Section>

            <div className="px-4 py-4 sm:px-5">
              <details className="group">
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  Дополнительно: тип задачи в Azure
                </summary>
                <label className={cn(FIELD_LABEL, 'mt-3 max-w-xs')}>
                  Тип записи
                  <Input value={draft.workItemType} maxLength={64} onChange={(event) => update({ workItemType: event.target.value })} className={FLAT_INPUT} placeholder="Task" />
                  <span className="font-normal">Обычно Task. Менять нужно, только если в проекте другой тип.</span>
                </label>
              </details>
            </div>

            <SaveBar
              dirty={editor.dirty && Boolean(draft.titleTemplate.trim() && draft.workItemType.trim())}
              saving={editor.saving}
              notice={editor.notice}
              error={editor.saveError}
              onSave={editor.save}
              onDefaults={() => {
                const defaults = migrateWriteBackSettingsV1({});
                editor.reset({ workItemType: defaults.workItemType, titleTemplate: defaults.titleTemplate, tagsTemplate: defaults.tagsTemplate, writeRules: defaults.writeRules });
              }}
              defaultsTitle="Вернуть шаблон к стандартному"
            />
          </fieldset>

          <aside aria-label="Предпросмотр" className="border-t border-border bg-muted/20 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <div className="space-y-4 lg:sticky lg:top-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Так задача появится в Azure</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Пример на вымышленных данных. Обновляется, пока вы печатаете.</p>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-3 text-sm [overflow-wrap:anywhere]">
                <p className="font-medium text-foreground">{preview.title || <span className="text-destructive">Название пустое</span>}</p>
                {preview.tags.length ? <div className="flex flex-wrap gap-1.5">{preview.tags.map((tag) => <span key={tag} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">{tag}</span>)}</div> : null}
                {preview.description ? <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{preview.description}</p> : <p className="text-xs text-muted-foreground">Описание не заполняется.</p>}
                {preview.fields.length ? <dl className="grid gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-1">
                  {preview.fields.map(([field, value]) => <div key={field} title={field} className="min-w-0 text-xs">
                    <dt className="font-medium text-foreground">{fieldName(field)}</dt>
                    <dd className="mt-0.5 text-muted-foreground">{String(value)}</dd>
                  </div>)}
                </dl> : null}
              </div>
              {preview.warnings.length ? <ul className="space-y-1 text-xs text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300">
                {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul> : null}
            </div>
          </aside>
        </div>
      )}
    </Panel>
  );
}
