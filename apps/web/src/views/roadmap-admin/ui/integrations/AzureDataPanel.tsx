'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { SyncSettingsV2 } from '@tracker/shared';
import type { RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { HelpHint } from './HelpHint';
import { FLAT_OUTLINE, FLAT_SELECT, FieldPicker, FieldSourcePicker, Panel, SaveBar, Section } from './parts';
import { useAzureFields, useSyncSettingsEditor } from './useSyncSettingsEditor';

const KEYS = ['fact', 'readRules'] as const;
const FIELD_LABEL = 'grid min-w-0 content-start gap-1.5 text-xs font-medium text-muted-foreground';

/** What Roadmap reads back from Azure: logged hours for plan-vs-fact, and extra fields shown on the plan. */
export function AzureDataPanel({ overview }: { overview?: RoadmapWriteBackOverview }) {
  const editor = useSyncSettingsEditor(KEYS);
  const { draft, update } = editor;
  const azure = useAzureFields(overview, editor.full?.workItemType);

  return (
    <Panel title="Данные из Azure" description="Что Roadmap читает из Azure DevOps: списанное время и дополнительные поля для плана. Если всё работает, менять здесь ничего не нужно.">
      {!draft ? <p role="status" className="p-5 text-sm text-muted-foreground">Загружаем настройки…</p> : (
        <fieldset disabled={editor.saving} aria-label="Данные из Azure" className="min-w-0 divide-y divide-border">
          <div className="px-4 pt-5 sm:px-5">
            <FieldSourcePicker projects={azure.projects} projectId={azure.projectId} onChange={azure.setProjectId} loading={azure.query.isFetching} onRefresh={() => void azure.query.refetch()} />
          </div>

          <Section
            title="Фактические часы"
            hint="Откуда Roadmap берёт списанное время, чтобы сравнивать его с планом."
            action={<HelpHint text="Числовое поле Azure, из которого берётся факт. Обычно это «Completed Work» («Выполнено»)." faqId="fact-source" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={FIELD_LABEL}>
                Поле с фактическими часами
                <FieldPicker value={draft.fact.field} fields={azure.fields} onChange={(next) => update({ fact: { ...draft.fact, field: next } })} />
              </label>
              <label className={FIELD_LABEL}>
                Какие задачи учитывать
                <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.fact.scope} onChange={(next) => update({ fact: { ...draft.fact, scope: next as SyncSettingsV2['fact']['scope'] } })} options={[{ value: 'roadmapTasks', label: 'Только задачи Roadmap' }, { value: 'allChildTasks', label: 'Все дочерние задачи' }]} />
              </label>
            </div>
          </Section>

          <Section
            title="Что показывать на плане"
            hint="Данные из Azure DevOps можно вывести на плане значком или отдельной колонкой."
            action={<Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(FLAT_OUTLINE, 'gap-1.5')}
              onClick={() => update({
                readRules: [...draft.readRules, {
                  id: `read-${crypto.randomUUID()}`,
                  workItemTypes: ['Feature', 'Epic'],
                  field: azure.fields.find((item) => item.isCustom)?.referenceName ?? 'Custom.Field',
                  label: 'Новое поле',
                  display: 'column',
                }],
              })}
            ><Plus aria-hidden="true" className="size-3.5" />Добавить поле</Button>}
          >
            {draft.readRules.length ? <div className="space-y-2">
              {draft.readRules.map((rule) => <div key={rule.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
                <label className={FIELD_LABEL}>
                  Поле в Azure
                  <FieldPicker value={rule.field} fields={azure.fields} onChange={(next) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, field: next } : item) })} />
                </label>
                <label className={FIELD_LABEL}>
                  Как показывать
                  <SearchableSelect className={FLAT_SELECT} searchable={false} value={rule.display} onChange={(next) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, display: next as typeof rule.display } : item) })} options={[{ value: 'badge', label: 'Значок' }, { value: 'column', label: 'Колонка' }, { value: 'hidden', label: 'Не показывать' }]} />
                </label>
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg text-muted-foreground shadow-none hover:text-destructive active:scale-100" onClick={() => update({ readRules: draft.readRules.filter((item) => item.id !== rule.id) })}>
                  <Trash2 aria-hidden="true" className="size-3.5" />Убрать
                </Button>
              </div>)}
            </div> : <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Дополнительные данные на плане не показываются.</p>}
          </Section>

          <SaveBar dirty={editor.dirty} saving={editor.saving} notice={editor.notice} error={editor.saveError} onSave={editor.save} />
        </fieldset>
      )}
    </Panel>
  );
}
