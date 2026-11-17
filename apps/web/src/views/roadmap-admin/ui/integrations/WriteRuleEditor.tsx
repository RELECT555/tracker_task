'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { FieldSource, WriteRule } from '@tracker/shared';
import type { RoadmapAzureField } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { FLAT_INPUT, FLAT_OUTLINE, FLAT_SELECT, FieldPicker } from './parts';
import { TEMPLATE_TOKENS } from './template-tokens';

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

const SOURCE_DEFAULTS: Record<FieldSource['kind'], FieldSource> = {
  constant: { kind: 'constant', value: '' },
  template: { kind: 'template', template: '' },
  roadmap: { kind: 'roadmap', value: 'estimate' },
  parentField: { kind: 'parentField', field: 'System.AreaPath' },
  byRole: { kind: 'byRole', values: {} },
};

function describeSource(source: FieldSource) {
  if (source.kind === 'constant') return source.value === '' ? 'значение не задано' : `всегда «${source.value}»`;
  if (source.kind === 'template') return source.template || 'текст не задан';
  if (source.kind === 'roadmap') return ROADMAP_VALUE_OPTIONS.find((option) => option.value === source.value)?.label ?? source.value;
  if (source.kind === 'parentField') return `как у фичи: ${source.field}`;
  return `зависит от роли (${Object.keys(source.values).length})`;
}

/** One field of the task as a single line; the full form opens on demand so default fields do not fill the screen. */
export function WriteRuleRow({ rule, fields, onChange, onDelete }: { rule: WriteRule; fields: RoadmapAzureField[]; onChange: (rule: WriteRule) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(rule.source.kind === 'constant' && rule.source.value === '');
  const name = fields.find((field) => field.referenceName === rule.targetField)?.name ?? rule.targetField;
  return (
    <div className={cn('rounded-lg border border-border', !rule.enabled && 'bg-muted/30')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <input type="checkbox" className="accent-primary" aria-label={`Заполнять поле ${name}`} checked={rule.enabled} onChange={(event) => onChange({ ...rule, enabled: event.target.checked })} />
        <div className={cn('min-w-0 flex-1 basis-48', !rule.enabled && 'opacity-60')}>
          <p className="truncate text-sm font-medium text-foreground" title={rule.targetField}>{name}</p>
          <p className="truncate text-xs text-muted-foreground">{describeSource(rule.source)} · {rule.apply === 'always' ? 'каждый раз' : 'только при создании'}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className={GHOST_FLAT} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Свернуть' : 'Изменить'}</Button>
        <Button type="button" variant="ghost" size="icon" className={cn(GHOST_FLAT, 'w-8 text-muted-foreground hover:text-destructive')} aria-label={`Удалить поле ${name}`} onClick={onDelete}><Trash2 aria-hidden="true" className="size-3.5" /></Button>
      </div>
      {open ? <WriteRuleForm rule={rule} fields={fields} onChange={onChange} /> : null}
    </div>
  );
}

function WriteRuleForm({ rule, fields, onChange }: { rule: WriteRule; fields: RoadmapAzureField[]; onChange: (rule: WriteRule) => void }) {
  const source = rule.source;
  const setSource = (next: FieldSource) => onChange({ ...rule, source: next });
  return (
    <div className="border-t border-border p-4">
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

      {source.kind === 'template' ? <p className="mt-2 text-xs text-muted-foreground">Подстановки: {TEMPLATE_TOKENS.map(({ token, chip }) => `${token} — ${chip.toLowerCase()}`).join(', ')}.</p> : null}
      {source.kind === 'constant' ? <p className="mt-2 text-xs text-muted-foreground">Это значение попадёт во все задачи. Для поля со списком укажите вариант так, как он назван в Azure.</p> : null}
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
