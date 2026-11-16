'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, Tag, LoaderCircle, Plus, RefreshCw, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react';
import { evaluateWriteRules, migrateWriteBackSettingsV1, syncSettingsV2Schema, type FieldSource, type SyncSettingsV2, type WriteRule } from '@tracker/shared';
import { roadmapApi, type RoadmapAzureField, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Input } from '@/shared/ui/input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { HelpHint } from './HelpHint';
import { FLAT_INPUT, FLAT_OUTLINE, FLAT_PRIMARY, FLAT_SELECT, Panel } from './parts';

const SAMPLE = { role: 'Backend', title: 'Заявки', quarterKey: '2026-Q4', person: 'Иван Петров', personEmail: 'ivan.petrov@example.test', id: '1234', estimate: 40, remaining: 40, fields: { 'System.AreaPath': 'Roadmap' } };
const FIELD_LABEL_CLASS = 'grid min-w-0 content-start gap-1.5 text-xs font-medium text-muted-foreground';
const GHOST_FLAT = 'h-8 rounded-lg shadow-none active:scale-100';

const SOURCE_OPTIONS = [
  { value: 'constant', label: 'Одно и то же значение', description: 'Один текст для всех задач', triggerDescription: null },
  { value: 'template', label: 'Текст с подстановками', description: 'Например, роль и квартал в названии', triggerDescription: null },
  { value: 'roadmap', label: 'Данные из Roadmap', description: 'Часы, исполнитель, квартал и т. д.', triggerDescription: null },
  { value: 'parentField', label: 'Как у фичи', description: 'Скопировать поле родительской фичи', triggerDescription: null },
  { value: 'byRole', label: 'Зависит от роли', description: 'Своё значение для каждой роли', triggerDescription: null },
];

const ROADMAP_VALUE_OPTIONS = [
  { value: 'estimate', label: 'Плановые часы' },
  { value: 'remaining', label: 'Оставшиеся часы' },
  { value: 'assignee', label: 'Исполнитель' },
  { value: 'roleName', label: 'Роль' },
  { value: 'quarterKey', label: 'Квартал' },
  { value: 'quarterStart', label: 'Начало квартала' },
  { value: 'quarterEnd', label: 'Конец квартала' },
  { value: 'iterationPath', label: 'Итерация квартала' },
  { value: 'parentAreaPath', label: 'Команда фичи' },
];

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
  const fieldName = (referenceName: string) => fields.find((field) => field.referenceName === referenceName)?.name ?? referenceName;
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
        setImportError('Выберите файл с настройками полей, который вы ранее сохранили.');
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
      setImportError('Не удалось прочитать файл.');
    }
  };

  return (
    <Panel
      title="Поля задач"
      description="Какие данные Roadmap записывает в задачи Azure DevOps и какие поля Azure показывает на плане. Если всё работает, менять здесь ничего не нужно."
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
      {draft ? <fieldset disabled={saveMutation.isPending} aria-label="Настройки полей задач" className="min-w-0 divide-y divide-border">
        <Block title="Откуда брать список полей" hint="Названия полей зависят от настроек вашего Azure DevOps. Выберите проект, и мы подставим его поля в списки ниже.">
          <div className="flex flex-wrap items-end gap-3">
            <label className={cn(FIELD_LABEL_CLASS, 'w-full max-w-sm')}>
              Проект
              <SearchableSelect className={FLAT_SELECT} value={projectId} onChange={setSelectedProjectId} disabled={!projectId} placeholder="Нет добавленных проектов" options={projects.map((project) => ({ value: project.id, label: project.name }))} />
            </label>
            <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={() => void fieldQuery.refetch()} disabled={!projectId || !draft.workItemType.trim() || fieldQuery.isFetching}>
              <RefreshCw aria-hidden="true" className={cn('size-3.5', fieldQuery.isFetching && 'motion-safe:animate-spin')} />Обновить список полей
            </Button>
          </div>
          {!projectId ? <p className="mt-2 text-xs text-muted-foreground">Добавьте проект на вкладке «Проекты», чтобы получить список его полей.</p> : null}
        </Block>

        <Block
          title="Какие поля заполнять в задаче"
          hint="Roadmap заполняет эти поля в созданной задаче Azure. Можно изменить, чем заполнять поле, или добавить свои, например «Отдел» или «Тип работ»."
          action={<Button type="button" size="sm" variant="outline" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={addRule} disabled={!availableField}><Plus aria-hidden="true" className="size-3.5" />Добавить поле</Button>}
        >
          {fieldQuery.isLoading ? <p role="status" className="mb-2 text-sm text-muted-foreground">Загружаем поля Azure…</p> : null}
          {draft.writeRules.length ? <div className="space-y-3">
            {draft.writeRules.map((rule, index) => (
              <WriteRuleRow
                key={rule.id}
                rule={rule}
                fields={fields}
                onChange={(next) => update({ writeRules: draft.writeRules.map((item, itemIndex) => itemIndex === index ? next : item) })}
                onDelete={() => update({ writeRules: draft.writeRules.filter((item) => item.id !== rule.id) })}
              />
            ))}
          </div> : <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Полей для заполнения нет. Добавьте поле, чтобы Roadmap заполнял его в задаче.</p>}

          {Object.keys(value.values).length ? <div className="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Так заполнится задача (пример на вымышленных данных)</p>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {Object.entries(value.values).map(([field, fieldValue]) => <div key={field} title={field} className="min-w-0 text-xs [overflow-wrap:anywhere]">
                <dt className="font-medium text-foreground">{fieldName(field)}</dt>
                <dd className="mt-0.5 text-muted-foreground">{String(fieldValue)}</dd>
              </div>)}
            </dl>
          </div> : null}
          {value.warnings.length ? <ul className="mt-3 space-y-1 text-xs text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300">
            {value.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul> : null}
        </Block>

        <Block
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
                field: fields.find((item) => item.isCustom)?.referenceName ?? 'Custom.Field',
                label: 'Новое поле',
                display: 'column',
              }],
            })}
          ><Plus aria-hidden="true" className="size-3.5" />Добавить поле</Button>}
        >
          {draft.readRules.length ? <div className="space-y-2">
            {draft.readRules.map((rule) => <div key={rule.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
              <label className={FIELD_LABEL_CLASS}>
                Поле в Azure
                <FieldPicker value={rule.field} fields={fields} onChange={(next) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, field: next } : item) })} />
              </label>
              <label className={FIELD_LABEL_CLASS}>
                Как показывать
                <SearchableSelect className={FLAT_SELECT} searchable={false} value={rule.display} onChange={(next) => update({ readRules: draft.readRules.map((item) => item.id === rule.id ? { ...item, display: next as typeof rule.display } : item) })} options={[{ value: 'badge', label: 'Значок' }, { value: 'column', label: 'Колонка' }, { value: 'hidden', label: 'Не показывать' }]} />
              </label>
              <Button type="button" variant="ghost" size="sm" className={cn(GHOST_FLAT, 'gap-1.5 text-muted-foreground hover:text-destructive')} onClick={() => update({ readRules: draft.readRules.filter((item) => item.id !== rule.id) })}>
                <Trash2 aria-hidden="true" className="size-3.5" />Убрать
              </Button>
            </div>)}
          </div> : <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Дополнительные данные на плане не показываются.</p>}
        </Block>

        <Block title="Фактические часы" hint="Откуда Roadmap берёт списанное время, чтобы сравнивать его с планом." help={<HelpHint text="Числовое поле Azure, из которого берётся факт. Обычно это «Completed Work» («Выполнено»)." faqId="fact-source" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={FIELD_LABEL_CLASS}>
              Поле с фактическими часами
              <FieldPicker value={draft.fact.field} fields={fields} onChange={(next) => update({ fact: { ...draft.fact, field: next } })} />
            </label>
            <label className={FIELD_LABEL_CLASS}>
              Какие задачи учитывать
              <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.fact.scope} onChange={(next) => update({ fact: { ...draft.fact, scope: next as SyncSettingsV2['fact']['scope'] } })} options={[{ value: 'roadmapTasks', label: 'Только задачи Roadmap' }, { value: 'allChildTasks', label: 'Все дочерние задачи' }]} />
            </label>
          </div>
        </Block>

        <Block title="Если данные расходятся" hint="Что делать, если одно и то же изменили и в Roadmap, и в Azure, или убрали назначение." help={<HelpHint text="Оценку и исполнителя, изменённые в задаче Azure, Roadmap сам принимает в план. Здесь выбирается поведение для спорных случаев." />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={FIELD_LABEL_CLASS}>
              Оценку изменили и в Roadmap, и в Azure
              <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.conflictPolicy} onChange={(next) => update({ conflictPolicy: next as SyncSettingsV2['conflictPolicy'] })} options={[
                { value: 'overwrite', label: 'Оставить значение Roadmap', description: 'Azure перезапишется при отправке' },
                { value: 'skip-field', label: 'Взять значение из Azure', description: 'План в Roadmap заменится' },
                { value: 'stop', label: 'Остановиться и спросить', description: 'Назначение помечается «Расходится с Azure»' },
              ]} />
            </label>
            <label className={FIELD_LABEL_CLASS}>
              Назначение удалили или обнулили часы
              <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.removalPolicy.action} onChange={(next) => update({ removalPolicy: { ...draft.removalPolicy, action: next as SyncSettingsV2['removalPolicy']['action'] } })} options={[
                { value: 'keep', label: 'Оставить задачу в Azure' },
                { value: 'set-state', label: 'Перевести задачу в другое состояние' },
                { value: 'delete', label: 'Удалить задачу', description: 'Попадёт в корзину Azure, её можно восстановить' },
              ]} />
            </label>
            {draft.removalPolicy.action === 'set-state' ? <label className={FIELD_LABEL_CLASS}>
              В какое состояние перевести
              <Input className={FLAT_INPUT} value={draft.removalPolicy.state ?? ''} placeholder="Removed" onChange={(event) => update({ removalPolicy: { ...draft.removalPolicy, state: event.target.value } })} />
              <span className="font-normal">Название состояния так, как оно называется в вашем Azure.</span>
            </label> : null}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Плановые часы всегда записываются в фичу: сумма по каждой роли заменяет то, что вы ввели в Azure вручную. Задача в Azure создаётся отдельной кнопкой у назначения.
          </p>
        </Block>

        <div className="px-4 py-4 sm:px-5">
          <details className="group">
            <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              Дополнительно: тип задач, права и перенос настроек
            </summary>
            <div className="mt-3 grid gap-5 rounded-lg border border-border p-4 sm:grid-cols-2">
              <label className={FIELD_LABEL_CLASS}>
                Тип задач в Azure
                <Input value={draft.workItemType} onChange={(event) => update({ workItemType: event.target.value })} className={FLAT_INPUT} placeholder="Task" />
                <span className="font-normal">Обычно Task. Менять нужно, только если в вашем проекте другой тип задач.</span>
              </label>
              <label className={FIELD_LABEL_CLASS}>
                Кто может отправлять в Azure вручную
                <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.pushPermission} onChange={(next) => update({ pushPermission: next === 'admins' ? 'admins' : 'planners' })} options={[{ value: 'planners', label: 'Пользователи Roadmap' }, { value: 'admins', label: 'Только администраторы' }]} />
              </label>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Перенос настроек</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={exportSettings}><Download aria-hidden="true" className="size-3.5" />Сохранить в файл</Button>
                  <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={() => importRef.current?.click()}><Upload aria-hidden="true" className="size-3.5" />Загрузить из файла</Button>
                  <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importSettings(file);
                    event.target.value = '';
                  }} />
                </div>
                <p className="text-xs text-muted-foreground">Удобно, чтобы повторить те же настройки на другом стенде или сделать резервную копию.</p>
                {importError ? <p role="alert" className="text-sm text-destructive">{importError}</p> : null}
              </div>
            </div>
          </details>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <p role="status" className="text-xs text-muted-foreground">
            {notice ?? (dirty ? 'Есть несохранённые изменения.' : 'Все изменения сохранены.')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" className={cn(GHOST_FLAT, 'gap-1.5')} title="Вернуть все настройки полей к значениям по умолчанию" onClick={() => update(migrateWriteBackSettingsV1({}))}><RotateCcw aria-hidden="true" className="size-3.5" />По умолчанию</Button>
            <Button type="button" size="sm" className={cn(FLAT_PRIMARY, 'gap-1.5')} disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
              {saveMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" /> : <Save aria-hidden="true" className="size-3.5" />}
              {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </fieldset> : null}
    </Panel>
  );
}

function Block({ title, hint, help, action, children }: { title: string; hint?: string; help?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 py-5 sm:px-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {help}
          </div>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Picks an Azure field by its display name; falls back to a text input until the project's field list is loaded. */
function FieldPicker({ value, fields, onChange, writableOnly = false }: { value: string; fields: RoadmapAzureField[]; onChange: (value: string) => void; writableOnly?: boolean }) {
  if (!fields.length) return <Input className={FLAT_INPUT} value={value} onChange={(event) => onChange(event.target.value)} />;
  const hasCurrent = fields.some((field) => field.referenceName === value);
  return <SearchableSelect className={FLAT_SELECT} value={value} onChange={onChange} options={[
    ...(!hasCurrent ? [{ value, label: value, leading: <Tag aria-hidden="true" className="size-4" />, triggerDescription: null }] : []),
    ...fields.filter((field) => !writableOnly || !field.readOnly || field.referenceName === value).map((field) => ({ value: field.referenceName, label: field.name, description: field.referenceName, triggerDescription: null, leading: <Tag aria-hidden="true" className="size-4" /> })),
  ]} />;
}

const SOURCE_DEFAULTS: Record<FieldSource['kind'], FieldSource> = {
  constant: { kind: 'constant', value: '' },
  template: { kind: 'template', template: '' },
  roadmap: { kind: 'roadmap', value: 'estimate' },
  parentField: { kind: 'parentField', field: 'System.AreaPath' },
  byRole: { kind: 'byRole', values: {} },
};

function WriteRuleRow({ rule, fields, onChange, onDelete }: { rule: WriteRule; fields: RoadmapAzureField[]; onChange: (rule: WriteRule) => void; onDelete: () => void }) {
  const source = rule.source;
  const setSource = (next: FieldSource) => onChange({ ...rule, source: next });
  return (
    <div className={cn('rounded-lg border border-border p-4', !rule.enabled && 'bg-muted/30')}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <label className={FIELD_LABEL_CLASS}>
          Какое поле заполнять
          <FieldPicker value={rule.targetField} fields={fields} writableOnly onChange={(next) => onChange({ ...rule, targetField: next })} />
        </label>
        <label className={FIELD_LABEL_CLASS}>
          Чем заполнять
          <SearchableSelect className={FLAT_SELECT} searchable={false} value={source.kind} onChange={(next) => setSource(SOURCE_DEFAULTS[next as FieldSource['kind']])} options={SOURCE_OPTIONS} />
        </label>
        {source.kind === 'constant' ? <label className={FIELD_LABEL_CLASS}>
          Значение
          <Input className={FLAT_INPUT} value={String(source.value)} onChange={(event) => setSource({ ...source, value: event.target.value })} />
        </label>
          : source.kind === 'template' ? <label className={FIELD_LABEL_CLASS}>
            Текст
            <Input className={FLAT_INPUT} value={source.template} onChange={(event) => setSource({ ...source, template: event.target.value })} placeholder="{role} · {quarterKey}" />
          </label>
          : source.kind === 'parentField' ? <label className={FIELD_LABEL_CLASS}>
            Откуда скопировать
            <FieldPicker value={source.field} fields={fields} onChange={(next) => setSource({ ...source, field: next })} />
          </label>
          : source.kind === 'roadmap' ? <label className={FIELD_LABEL_CLASS}>
            Какие данные взять
            <SearchableSelect className={FLAT_SELECT} searchable={false} value={source.value} onChange={(next) => setSource({ ...source, value: next as typeof source.value })} options={ROADMAP_VALUE_OPTIONS} />
          </label>
          : null}
        <label className={FIELD_LABEL_CLASS}>
          Когда заполнять
          <SearchableSelect className={FLAT_SELECT} searchable={false} value={rule.apply} onChange={(next) => onChange({ ...rule, apply: next as WriteRule['apply'] })} options={[{ value: 'always', label: 'Каждый раз', description: 'При каждой отправке в Azure', triggerDescription: null }, { value: 'create', label: 'Только при создании', description: 'Не менять в уже созданных задачах', triggerDescription: null }]} />
        </label>
      </div>

      {source.kind === 'byRole' ? <div className="mt-4"><ByRoleEditor values={source.values} onChange={(values) => setSource({ ...source, values })} /></div> : null}

      {source.kind === 'template' ? <p className="mt-2 text-xs text-muted-foreground">Подстановки: {'{role}'} — роль, {'{title}'} — название фичи, {'{quarterKey}'} — квартал, {'{person}'} — участник.</p> : null}
      {source.kind === 'constant' ? <p className="mt-2 text-xs text-muted-foreground">Это значение попадёт во все задачи. Для поля со списком укажите вариант так, как он назван в Azure.</p> : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-8 items-center gap-2 text-xs">
          <input type="checkbox" className="accent-primary" checked={rule.enabled} onChange={(event) => onChange({ ...rule, enabled: event.target.checked })} />Заполнять это поле
        </label>
        <Button type="button" variant="ghost" size="sm" className={cn(GHOST_FLAT, 'gap-1.5 text-muted-foreground hover:text-destructive')} onClick={onDelete}><Trash2 aria-hidden="true" className="size-3.5" />Удалить</Button>
      </div>
    </div>
  );
}

/** Role → value table; replaces hand-written JSON. */
function ByRoleEditor({ values, onChange }: { values: Record<string, string | number>; onChange: (values: Record<string, string | number>) => void }) {
  const [rows, setRows] = useState(() => Object.entries(values).map(([role, item]) => ({ role, value: String(item), numeric: typeof item === 'number' })));
  const commit = (next: typeof rows) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter((row) => row.role.trim()).map((row) => {
      const text = row.value.trim();
      return [row.role.trim(), row.numeric && text !== '' && !Number.isNaN(Number(text)) ? Number(text) : row.value];
    })));
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Значение для каждой роли</p>
      {rows.length ? <ul className="space-y-2">
        {rows.map((row, index) => <li key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
          <Input className={FLAT_INPUT} aria-label="Роль" placeholder="Роль, например Backend" value={row.role} onChange={(event) => commit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} />
          <Input className={FLAT_INPUT} aria-label={`Значение для роли ${row.role || index + 1}`} placeholder="Значение" value={row.value} onChange={(event) => commit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
          <Button type="button" variant="ghost" size="sm" className={cn(GHOST_FLAT, 'w-8 px-0 text-muted-foreground hover:text-destructive')} aria-label={`Убрать роль ${row.role || index + 1}`} onClick={() => commit(rows.filter((_, itemIndex) => itemIndex !== index))}><X aria-hidden="true" className="size-4" /></Button>
        </li>)}
      </ul> : <p className="text-xs text-muted-foreground">Пока ни одной роли. Добавьте первую.</p>}
      <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={() => commit([...rows, { role: '', value: '', numeric: false }])}><Plus aria-hidden="true" className="size-3.5" />Добавить роль</Button>
    </div>
  );
}
