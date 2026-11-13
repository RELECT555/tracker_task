'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LoaderCircle, Plus, RotateCcw, Save, Upload } from 'lucide-react';
import { evaluateWriteRules, migrateWriteBackSettingsV1, type FieldSource, type SyncSettingsV2, type WriteRule } from '@tracker/shared';
import { roadmapApi, type RoadmapAzureField, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { HelpHint } from './HelpHint';
import { errorText, Panel } from './parts';

const SAMPLE = { role: 'Backend', title: 'Заявки', quarterKey: '2026-Q4', person: 'Иван Петров', personEmail: 'ivan.petrov@example.test', id: '1234', estimate: 40, remaining: 40, fields: { 'System.AreaPath': 'Roadmap' } };

export function FieldMappingPanel({ overview }: { overview?: RoadmapWriteBackOverview }) {
  const queryClient = useQueryClient();
  const projects = useMemo(() => overview?.projects ?? [], [overview?.projects]);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [draft, setDraft] = useState<SyncSettingsV2 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const settingsQuery = useQuery({ queryKey: ['roadmap', 'sync-settings-v2'], queryFn: roadmapApi.syncSettingsV2 });
  const settings = settingsQuery.data;
  useEffect(() => { if (settings) setDraft(settings); }, [settings]);
  useEffect(() => { if (!projectId && projects[0]) setProjectId(projects[0].id); }, [projectId, projects]);
  const fieldQuery = useQuery({
    queryKey: ['roadmap', 'azure-fields', projectId, draft?.workItemType],
    queryFn: () => roadmapApi.azureFields(projectId, draft?.workItemType ?? 'Task'),
    enabled: Boolean(projectId && draft?.workItemType),
  });
  const fields = fieldQuery.data ?? [];
  const saveMutation = useMutation({
    mutationFn: (value: SyncSettingsV2) => roadmapApi.saveSyncSettingsV2(value),
    onSuccess: async (value) => { setDraft(value); setNotice('Маппинг сохранён.'); await queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }); },
  });
  const value = draft ? evaluateWriteRules(draft.writeRules, SAMPLE, new Map(fields.map((field) => [field.referenceName, field])), true) : { values: {}, warnings: [] };
  const dirty = Boolean(settings && draft && JSON.stringify(settings) !== JSON.stringify(draft));
  const update = (patch: Partial<SyncSettingsV2>) => { setNotice(null); setDraft((current) => current ? { ...current, ...patch } : current); };
  const addRule = () => {
    const field = fields.find((item) => !draft?.writeRules.some((rule) => rule.targetField === item.referenceName)) ?? fields.find((item) => item.isCustom);
    if (!draft || !field) return;
    const rule: WriteRule = { id: `rule-${crypto.randomUUID()}`, targetField: field.referenceName, source: { kind: 'constant', value: '' }, apply: 'always', enabled: true };
    update({ writeRules: [...draft.writeRules, rule] });
  };
  const exportSettings = () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'roadmap-sync-settings.json'; link.click(); URL.revokeObjectURL(url);
  };
  const importSettings = async (file: File) => {
    try { update(JSON.parse(await file.text()) as SyncSettingsV2); setNotice('Файл загружен. Проверьте изменения и сохраните.'); } catch { setNotice('Не удалось прочитать JSON настроек.'); }
  };

  return (
    <Panel title="Маппинг полей" description="Настройте поля, которые Roadmap читает и записывает в Azure DevOps." actions={<HelpHint text="Правила записи вычисляются в общем пакете и используются API и интерфейсом одинаково." example="Custom.Activity ← константа или роль" faqId="custom-fields" />}>
      {settingsQuery.isLoading ? <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Загружаем настройки…</p> : null}
      {settingsQuery.error ? <p role="alert" className="p-5 text-sm text-destructive">{errorText(settingsQuery.error)}</p> : null}
      {!settingsQuery.isLoading && !settingsQuery.error && !projects.length ? <p className="p-5 text-sm text-muted-foreground">Сначала импортируйте проект, чтобы загрузить поля Azure DevOps.</p> : null}
      {draft ? <div className="divide-y divide-border">
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Проект-образец<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Тип задачи<Input value={draft.workItemType} onChange={(event) => update({ workItemType: event.target.value })} className="mt-1 h-9" /></label>
          <div className="flex items-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => fieldQuery.refetch()} disabled={fieldQuery.isFetching}>Обновить поля</Button><Button type="button" variant="ghost" size="sm" onClick={exportSettings}><Download className="h-3.5 w-3.5" />Экспорт</Button><Button type="button" variant="ghost" size="sm" onClick={() => importRef.current?.click()}><Upload className="h-3.5 w-3.5" />Импорт</Button><input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSettings(file); event.target.value = ''; }} /></div>
        </div>

        <section className="space-y-3 px-5 py-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">Правила записи</h3><p className="text-xs text-muted-foreground">Readonly-поля нельзя выбрать; значения picklist проверяются по списку Azure.</p></div><Button type="button" size="sm" variant="outline" onClick={addRule} disabled={!fields.length}><Plus className="h-3.5 w-3.5" />Добавить правило</Button></div>{fieldQuery.isLoading ? <p className="text-sm text-muted-foreground">Загружаем поля Azure…</p> : null}{fieldQuery.error ? <p className="text-sm text-destructive">{errorText(fieldQuery.error)}</p> : null}<div className="space-y-2">{draft.writeRules.map((rule, index) => <WriteRuleRow key={rule.id} rule={rule} fields={fields} onChange={(next) => update({ writeRules: draft.writeRules.map((item, itemIndex) => itemIndex === index ? next : item) })} onDelete={() => update({ writeRules: draft.writeRules.filter((item) => item.id !== rule.id) })} />)}</div>{!draft.writeRules.length ? <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">Правил записи пока нет.</p> : null}</section>

        <section className="space-y-3 px-5 py-4"><h3 className="text-sm font-semibold text-foreground">Живой пример <HelpHint text="Показывает итоговые значения правил для тестового назначения." example="Backend, Иван Петров, 40 ч" /></h3>{Object.keys(value.values).length ? <div className="grid gap-2 sm:grid-cols-2">{Object.entries(value.values).map(([field, fieldValue]) => <div key={field} className="rounded-md border border-border px-3 py-2 text-xs"><span className="font-mono text-foreground">{field}</span><span className="mt-1 block text-muted-foreground">{String(fieldValue)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Включите правило с непустым источником.</p>}{value.warnings.length ? <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">{value.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</section>

        <section className="grid gap-4 px-5 py-4 md:grid-cols-2"><div><h3 className="text-sm font-semibold text-foreground">Правила чтения</h3><p className="mt-1 text-xs text-muted-foreground">Кастомные поля можно показать бейджем или колонкой на плане.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => update({ readRules: [...draft.readRules, { id: `read-${crypto.randomUUID()}`, workItemTypes: ['Feature', 'Epic'], field: fields.find((item) => item.isCustom)?.referenceName ?? 'Custom.Field', label: 'Новое поле', display: 'column' }] })}><Plus className="h-3.5 w-3.5" />Добавить правило чтения</Button>{draft.readRules.map((rule) => <div key={rule.id} className="mt-2 flex items-center gap-2 rounded-md border border-border p-2 text-xs"><Input value={rule.field} onChange={(event) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, field: event.target.value } : item) })} /><select value={rule.display} onChange={(event) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, display: event.target.value as typeof rule.display } : item) })} className="h-9 rounded-md border border-input bg-background px-2"><option value="badge">Бейдж</option><option value="column">Колонка</option><option value="hidden">Скрыто</option></select></div>)}</div><div><h3 className="text-sm font-semibold text-foreground">Источник факта <HelpHint text="Числовое поле Azure, из которого берётся факт." example="Microsoft.VSTS.Scheduling.CompletedWork" faqId="fact-source" /></h3><Input value={draft.fact.field} onChange={(event) => update({ fact: { ...draft.fact, field: event.target.value } })} className="mt-3" /><select value={draft.fact.scope} onChange={(event) => update({ fact: { ...draft.fact, scope: event.target.value as SyncSettingsV2['fact']['scope'] } })} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="roadmapTasks">Только задачи Roadmap</option><option value="allChildTasks">Все дочерние задачи</option></select></div></section>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">{saveMutation.error ? <p className="text-sm text-destructive">{errorText(saveMutation.error)}</p> : notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : <span className="text-xs text-muted-foreground">{dirty ? 'Есть несохранённые изменения.' : 'Настройки сохранены.'}</span>}<div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setDraft(migrateWriteBackSettingsV1({}))}><RotateCcw className="h-3.5 w-3.5" />Сбросить</Button><Button type="button" size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => draft && saveMutation.mutate(draft)}>{saveMutation.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Сохранить</Button></div></div>
      </div> : null}
    </Panel>
  );
}

function WriteRuleRow({ rule, fields, onChange, onDelete }: { rule: WriteRule; fields: RoadmapAzureField[]; onChange: (rule: WriteRule) => void; onDelete: () => void }) {
  const field = fields.find((item) => item.referenceName === rule.targetField);
  const source = rule.source;
  const setSource = (next: FieldSource) => onChange({ ...rule, source: next });
  return <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1.2fr_1fr_110px_auto] md:items-center"><select value={rule.targetField} onChange={(event) => onChange({ ...rule, targetField: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm" disabled={field?.readOnly}>{fields.map((item) => <option key={item.referenceName} value={item.referenceName} disabled={item.readOnly}>{item.name} · {item.referenceName}</option>)}</select><div className="flex gap-2"><select value={source.kind} onChange={(event) => { const kind = event.target.value as FieldSource['kind']; const next: FieldSource = kind === 'template' ? { kind: 'template', template: '' } : kind === 'roadmap' ? { kind: 'roadmap', value: 'estimate' } : kind === 'parentField' ? { kind: 'parentField', field: 'System.AreaPath' } : kind === 'byRole' ? { kind: 'byRole', values: {} } : { kind: 'constant', value: '' }; setSource(next); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="constant">Константа</option><option value="template">Шаблон</option><option value="roadmap">Roadmap</option><option value="parentField">Поле фичи</option><option value="byRole">По ролям</option></select>{source.kind === 'constant' ? <Input value={String(source.value)} onChange={(event) => setSource({ ...source, value: event.target.value })} placeholder="Значение" /> : source.kind === 'template' ? <Input value={source.template} onChange={(event) => setSource({ ...source, template: event.target.value })} placeholder="{role} · {quarterKey}" /> : source.kind === 'parentField' ? <Input value={source.field} onChange={(event) => setSource({ ...source, field: event.target.value })} /> : source.kind === 'roadmap' ? <select value={source.value} onChange={(event) => setSource({ ...source, value: event.target.value as typeof source.value })} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"><option value="estimate">Оценка</option><option value="remaining">Remaining Work</option><option value="assignee">Исполнитель</option><option value="roleName">Роль</option><option value="quarterKey">Квартал</option></select> : <Input value={source.kind === 'byRole' ? JSON.stringify(source.values) : ''} onChange={(event) => { try { setSource({ ...source, values: JSON.parse(event.target.value) as Record<string, string | number> }); } catch { /* edit in progress */ } }} placeholder="{&quot;Backend&quot;:&quot;Development&quot;}" />}</div><select value={rule.apply} onChange={(event) => onChange({ ...rule, apply: event.target.value as WriteRule['apply'] })} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="always">Всегда</option><option value="create">При создании</option></select><div className="flex items-center justify-end gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={rule.enabled} onChange={(event) => onChange({ ...rule, enabled: event.target.checked })} />Вкл.</label><Button type="button" variant="ghost" size="sm" onClick={onDelete}>Удалить</Button></div></div>;
}
