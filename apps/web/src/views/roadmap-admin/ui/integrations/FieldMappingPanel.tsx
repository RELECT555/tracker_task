'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LoaderCircle, Plus, RotateCcw, Save, Upload } from 'lucide-react';
import { evaluateWriteRules, migrateWriteBackSettingsV1, syncSettingsV2Schema, type FieldSource, type SyncSettingsV2, type WriteRule } from '@tracker/shared';
import { roadmapApi, type RoadmapAzureField, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Input } from '@/shared/ui/input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { HelpHint } from './HelpHint';
import { Panel } from './parts';

const SAMPLE = { role: 'Backend', title: 'Заявки', quarterKey: '2026-Q4', person: 'Иван Петров', personEmail: 'ivan.petrov@example.test', id: '1234', estimate: 40, remaining: 40, fields: { 'System.AreaPath': 'Roadmap' } };
const FIELD_LABEL_CLASS = 'grid min-w-0 content-start gap-1.5 text-xs font-medium text-muted-foreground';

export function FieldMappingPanel({ overview, queries = [] }: {
  overview?: RoadmapWriteBackOverview;
  queries?: ComponentProps<typeof QueryErrorNotice>['queries'];
}) {
  const queryClient = useQueryClient();
  const projects = overview?.projects ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const projectId = projects.find((project) => project.id === selectedProjectId)?.id ?? projects[0]?.id ?? '';
  const [draft, setDraft] = useState<SyncSettingsV2 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const settingsQuery = useQuery({ queryKey: ['roadmap', 'sync-settings-v2'], queryFn: roadmapApi.syncSettingsV2 });
  const settings = settingsQuery.data;
  const previousSettings = useRef<SyncSettingsV2 | undefined>(undefined);
  useEffect(() => {
    if (!settings) return;
    const previous = previousSettings.current;
    previousSettings.current = settings;
    setDraft((current) => !current || JSON.stringify(current) === JSON.stringify(previous) ? settings : current);
  }, [settings]);
  const fieldsEnabled = Boolean(projectId && draft?.workItemType.trim());
  const fieldQuery = useQuery({
    queryKey: ['roadmap', 'azure-fields', projectId, draft?.workItemType.trim()],
    queryFn: () => roadmapApi.azureFields(projectId, draft?.workItemType.trim() ?? 'Task'),
    enabled: fieldsEnabled,
  });
  const fields = fieldQuery.data ?? [];
  const saveMutation = useMutation({
    mutationFn: (value: SyncSettingsV2) => roadmapApi.saveSyncSettingsV2(value),
    onSuccess: async (value) => {
      queryClient.setQueryData(['roadmap', 'sync-settings-v2'], value);
      setDraft(value);
      setNotice('Настройки полей сохранены.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
      ]);
    },
  });
  const value = draft ? evaluateWriteRules(draft.writeRules, SAMPLE, new Map(fields.map((field) => [field.referenceName, field])), true) : { values: {}, warnings: [] };
  const dirty = Boolean(settings && draft && JSON.stringify(settings) !== JSON.stringify(draft));
  const update = (patch: Partial<SyncSettingsV2>) => {
    setNotice(null);
    setImportError(null);
    if (saveMutation.isError) saveMutation.reset();
    setDraft((current) => current ? { ...current, ...patch } : current);
  };
  const availableField = fields.find((field) => !field.readOnly && !draft?.writeRules.some((rule) => rule.targetField === field.referenceName))
    ?? fields.find((field) => !field.readOnly && field.isCustom);
  const addRule = () => {
    if (!draft || !availableField) return;
    const rule: WriteRule = { id: `rule-${crypto.randomUUID()}`, targetField: availableField.referenceName, source: { kind: 'constant', value: '' }, apply: 'always', enabled: true };
    update({ writeRules: [...draft.writeRules, rule] });
  };
  const exportSettings = () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'roadmap-sync-settings.json'; link.click(); URL.revokeObjectURL(url);
  };
  const importSettings = async (file: File) => {
    setImportError(null);
    setNotice(null);
    try {
      const imported: unknown = JSON.parse(await file.text());
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
        setImportError('Выберите JSON-файл с настройками полей.');
        return;
      }
      const parsed = syncSettingsV2Schema.safeParse({ ...draft, ...imported });
      if (!parsed.success) {
        setImportError('В файле есть неверные значения. Проверьте настройки и попробуйте снова.');
        return;
      }
      update(parsed.data);
      setNotice('Файл загружен. Проверьте изменения и сохраните.');
    } catch {
      setImportError('Не удалось прочитать JSON-файл.');
    }
  };

  return (
    <Panel
      title="Сопоставление полей"
      description="Укажите, какие поля Roadmap читает из Azure DevOps и какие значения записывает в задачи."
      actions={<HelpHint text="Выберите поле Azure и укажите источник значения." example="Custom.Activity ← константа или роль" faqId="custom-fields" />}
    >
      {settingsQuery.isLoading ? <p role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />Загружаем настройки…
      </p> : null}
      <QueryErrorNotice
        title={saveMutation.error ? 'Не удалось сохранить настройки полей' : 'Не удалось загрузить данные интеграции'}
        queries={[...queries, settingsQuery, ...(fieldsEnabled ? [fieldQuery] : [])]}
        errors={[saveMutation.error]}
        className="mx-4 my-4 sm:mx-5"
      />
      {draft ? <fieldset disabled={saveMutation.isPending} aria-label="Настройки сопоставления полей" className="min-w-0 divide-y divide-border">
        <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-3">
          <label className={FIELD_LABEL_CLASS}>
            Проект для просмотра полей
            <SearchableSelect value={projectId} onChange={setSelectedProjectId} disabled={!projectId} placeholder="Нет добавленных проектов" options={projects.map((project) => ({ value: project.id, label: project.name }))} />
          </label>
          <label className={FIELD_LABEL_CLASS}>
            Тип задачи
            <Input value={draft.workItemType} onChange={(event) => update({ workItemType: event.target.value })} className="h-9" />
          </label>
          <label className={FIELD_LABEL_CLASS}>
            Кто может отправлять вручную
            <SearchableSelect searchable={false} value={draft.pushPermission} onChange={(value) => update({ pushPermission: value === 'admins' ? 'admins' : 'planners' })} options={[{ value: 'planners', label: 'Пользователи Roadmap' }, { value: 'admins', label: 'Только администраторы' }]} />
          </label>
          <div className="space-y-2 lg:col-span-3">
            {!projectId ? <p className="text-xs text-muted-foreground">Добавьте проект на вкладке «Проекты», чтобы получить список его полей.</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void fieldQuery.refetch()} disabled={!projectId || !draft.workItemType.trim() || fieldQuery.isFetching}>Обновить поля</Button>
              <Button type="button" variant="ghost" size="sm" onClick={exportSettings}><Download aria-hidden="true" className="size-3.5" />Экспорт JSON</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => importRef.current?.click()}><Upload aria-hidden="true" className="size-3.5" />Импорт JSON</Button>
              <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importSettings(file);
                event.target.value = '';
              }} />
            </div>
            {importError ? <p role="alert" className="text-sm text-destructive">{importError}</p> : null}
          </div>
        </div>

        <section className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Правила записи</h3>
              <p className="mt-1 text-xs text-muted-foreground">Для поля со списком значений используйте вариант из Azure DevOps.</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addRule} disabled={!availableField}><Plus aria-hidden="true" className="size-3.5" />Добавить правило записи</Button>
          </div>
          {fieldQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Загружаем поля Azure…</p> : null}
          {draft.writeRules.length ? <div className="space-y-2">
            {draft.writeRules.map((rule, index) => (
              <WriteRuleRow
                key={rule.id}
                rule={rule}
                fields={fields}
                onChange={(next) => update({ writeRules: draft.writeRules.map((item, itemIndex) => itemIndex === index ? next : item) })}
                onDelete={() => update({ writeRules: draft.writeRules.filter((item) => item.id !== rule.id) })}
              />
            ))}
          </div> : <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">Правил записи пока нет.</p>}
        </section>

        <section className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Пример заполнения задачи</h3>
            <HelpHint text="Показывает значения для примера назначения." example="Backend, Иван Петров, 40 ч" />
          </div>
          {Object.keys(value.values).length ? <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(value.values).map(([field, fieldValue]) => <div key={field} className="min-w-0 rounded-md border border-border px-3 py-2 text-xs [overflow-wrap:anywhere]">
              <dt className="font-mono text-foreground">{field}</dt>
              <dd className="mt-1 text-muted-foreground">{String(fieldValue)}</dd>
            </div>)}
          </dl> : <p className="text-sm text-muted-foreground">Пример появится, когда включённое правило вернёт значение.</p>}
          {value.warnings.length ? <ul className="space-y-1 text-xs text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300">
            {value.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul> : null}
        </section>

        <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-2">
          <section className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Правила чтения</h3>
            <p className="mt-1 text-xs text-muted-foreground">На плане поле можно показать значком или отдельной колонкой.</p>
            {draft.readRules.map((rule) => <div key={rule.id} className="mt-2 grid gap-2 rounded-md border border-border p-2 sm:grid-cols-2">
              <label className={FIELD_LABEL_CLASS}>
                Поле Azure
                <Input value={rule.field} className="h-9" onChange={(event) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, field: event.target.value } : item) })} />
              </label>
              <label className={FIELD_LABEL_CLASS}>
                Вид на плане
                <SearchableSelect searchable={false} value={rule.display} onChange={(value) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, display: value as typeof rule.display } : item) })} options={[{ value: 'badge', label: 'Значок' }, { value: 'column', label: 'Колонка' }, { value: 'hidden', label: 'Скрыто' }]} />
              </label>
            </div>)}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => update({
                readRules: [...draft.readRules, {
                  id: `read-${crypto.randomUUID()}`,
                  workItemTypes: ['Feature', 'Epic'],
                  field: fields.find((item) => item.isCustom)?.referenceName ?? 'Custom.Field',
                  label: 'Новое поле',
                  display: 'column',
                }],
              })}
            ><Plus aria-hidden="true" className="size-3.5" />Добавить правило чтения</Button>
          </section>
          <section className="min-w-0 space-y-3">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Источник фактических часов</h3>
              <HelpHint text="Числовое поле Azure, из которого берётся факт." example="Microsoft.VSTS.Scheduling.CompletedWork" faqId="fact-source" />
            </div>
            <label className={FIELD_LABEL_CLASS}>
              Поле фактических часов в Azure
              <Input value={draft.fact.field} className="h-9" onChange={(event) => update({ fact: { ...draft.fact, field: event.target.value } })} />
            </label>
            <label className={FIELD_LABEL_CLASS}>
              Какие задачи учитывать
              <SearchableSelect searchable={false} value={draft.fact.scope} onChange={(value) => update({ fact: { ...draft.fact, scope: value as SyncSettingsV2['fact']['scope'] } })} options={[{ value: 'roadmapTasks', label: 'Только задачи Roadmap' }, { value: 'allChildTasks', label: 'Все дочерние задачи' }]} />
            </label>
          </section>
          <section className="min-w-0 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Двусторонняя синхронизация</h3>
              <HelpHint text="Оценку и исполнителя, изменённые в задаче Azure, Roadmap сам принимает в план. Здесь — что делать, если значение поменяли и в Roadmap, и в Azure, и что делать с задачей при снятии назначения." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={FIELD_LABEL_CLASS}>
                Оценку изменили и в Roadmap, и в Azure
                <SearchableSelect searchable={false} value={draft.conflictPolicy} onChange={(value) => update({ conflictPolicy: value as SyncSettingsV2['conflictPolicy'] })} options={[
                  { value: 'overwrite', label: 'Оставить значение Roadmap', description: 'Azure перезапишется при отправке' },
                  { value: 'skip-field', label: 'Взять значение из Azure', description: 'План в Roadmap заменится' },
                  { value: 'stop', label: 'Остановиться и спросить', description: 'Назначение помечается «Расходится с Azure»' },
                ]} />
              </label>
              <label className={FIELD_LABEL_CLASS}>
                Назначение удалено или часы обнулены
                <SearchableSelect searchable={false} value={draft.removalPolicy.action} onChange={(value) => update({ removalPolicy: { ...draft.removalPolicy, action: value as SyncSettingsV2['removalPolicy']['action'] } })} options={[
                  { value: 'keep', label: 'Оставить задачу в Azure' },
                  { value: 'set-state', label: 'Перевести задачу в состояние' },
                  { value: 'delete', label: 'Удалить задачу', description: 'Попадёт в корзину Azure, её можно восстановить' },
                ]} />
              </label>
              {draft.removalPolicy.action === 'set-state' ? <label className={FIELD_LABEL_CLASS}>
                Состояние снятой задачи
                <Input className="h-9" value={draft.removalPolicy.state ?? ''} placeholder="Removed" onChange={(event) => update({ removalPolicy: { ...draft.removalPolicy, state: event.target.value } })} />
              </label> : null}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Часы плана всегда пишутся в фичу: сумма по каждой роли уходит в поле оценки роли (или в поле суммы из сопоставления ролей) и перезаписывает значение, введённое в Azure вручную. Задача в Azure создаётся отдельной кнопкой у назначения.
              </p>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <p role="status" className="text-xs text-muted-foreground">
            {notice ?? (dirty ? 'Есть несохранённые изменения.' : 'Все изменения сохранены.')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => update(migrateWriteBackSettingsV1({}))}><RotateCcw aria-hidden="true" className="size-3.5" />По умолчанию</Button>
            <Button type="button" size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
              {saveMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" /> : <Save aria-hidden="true" className="size-3.5" />}
              {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </fieldset> : null}
    </Panel>
  );
}

const SOURCE_DEFAULTS: Record<FieldSource['kind'], FieldSource> = {
  constant: { kind: 'constant', value: '' },
  template: { kind: 'template', template: '' },
  roadmap: { kind: 'roadmap', value: 'estimate' },
  parentField: { kind: 'parentField', field: 'System.AreaPath' },
  byRole: { kind: 'byRole', values: {} },
};

function WriteRuleRow({ rule, fields, onChange, onDelete }: { rule: WriteRule; fields: RoadmapAzureField[]; onChange: (rule: WriteRule) => void; onDelete: () => void }) {
  const hasCurrentField = fields.some((field) => field.referenceName === rule.targetField);
  const source = rule.source;
  const setSource = (next: FieldSource) => onChange({ ...rule, source: next });
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_110px_auto]">
      <label className={FIELD_LABEL_CLASS}>
        Поле Azure
        <SearchableSelect value={rule.targetField} onChange={(value) => onChange({ ...rule, targetField: value })} disabled={!fields.length} options={[
          ...(!hasCurrentField ? [{ value: rule.targetField, label: rule.targetField }] : []),
          ...fields.filter((field) => !field.readOnly || field.referenceName === rule.targetField).map((field) => ({ value: field.referenceName, label: field.name, description: field.referenceName })),
        ]} />
      </label>
      <label className={FIELD_LABEL_CLASS}>
        Источник
        <SearchableSelect searchable={false} value={source.kind} onChange={(value) => setSource(SOURCE_DEFAULTS[value as FieldSource['kind']])} options={[
          { value: 'constant', label: 'Постоянное значение' },
          { value: 'template', label: 'Шаблон' },
          { value: 'roadmap', label: 'Roadmap' },
          { value: 'parentField', label: 'Поле родительской задачи' },
          { value: 'byRole', label: 'По ролям' },
        ]} />
      </label>
      <label className={FIELD_LABEL_CLASS}>
        Значение
        {source.kind === 'constant' ? <Input className="h-9" value={String(source.value)} onChange={(event) => setSource({ ...source, value: event.target.value })} />
          : source.kind === 'template' ? <Input className="h-9" value={source.template} onChange={(event) => setSource({ ...source, template: event.target.value })} placeholder="{role} · {quarterKey}" />
          : source.kind === 'parentField' ? <Input className="h-9" value={source.field} onChange={(event) => setSource({ ...source, field: event.target.value })} />
          : source.kind === 'roadmap' ? <SearchableSelect searchable={false} value={source.value} onChange={(value) => setSource({ ...source, value: value as typeof source.value })} options={[
            { value: 'estimate', label: 'Оценка' },
            { value: 'remaining', label: 'Remaining Work' },
            { value: 'assignee', label: 'Исполнитель' },
            { value: 'roleName', label: 'Роль' },
            { value: 'quarterKey', label: 'Квартал' },
            { value: 'quarterStart', label: 'Начало квартала' },
            { value: 'quarterEnd', label: 'Конец квартала' },
            { value: 'iterationPath', label: 'Путь итерации' },
            { value: 'parentAreaPath', label: 'Область родительской задачи' },
          ]} />
          : <Input className="h-9" value={JSON.stringify(source.values)} onChange={(event) => {
            try { setSource({ ...source, values: JSON.parse(event.target.value) as Record<string, string | number> }); } catch { /* edit in progress */ }
          }} placeholder="{&quot;Backend&quot;:&quot;Development&quot;}" />}
      </label>
      <label className={FIELD_LABEL_CLASS}>
        Когда
        <SearchableSelect searchable={false} value={rule.apply} onChange={(value) => onChange({ ...rule, apply: value as WriteRule['apply'] })} options={[{ value: 'always', label: 'Всегда' }, { value: 'create', label: 'При создании' }]} />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-1 xl:self-end">
        <label className="flex min-h-9 items-center gap-1.5 text-xs">
          <input type="checkbox" className="accent-primary" checked={rule.enabled} onChange={(event) => onChange({ ...rule, enabled: event.target.checked })} />Включено
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={onDelete}>Удалить</Button>
      </div>
    </div>
  );
}
