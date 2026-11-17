import { useId, type ComponentProps, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, RotateCcw, Save, Tag } from 'lucide-react';
import type { RoadmapAzureField, RoadmapWriteBackMode } from '@/entities/roadmap/api/roadmapApi';
import { getErrorMessage } from '@/shared/lib/error-message';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { AdminCard } from '../AdminLayout';

export const integrationColors = '[html:not(.dark)_&]:[--primary:239_75%_56%] [html:not(.dark)_&]:[--destructive:0_72%_44%] dark:[--destructive:0_80%_72%] dark:[--destructive-foreground:0_0%_5%]';

/** Flat controls: no drop shadow or press-scale, soft border, so they sit on the card instead of floating above it. */
export const FLAT_OUTLINE = 'h-8 rounded-lg border-border bg-transparent shadow-none hover:bg-accent active:scale-100 dark:bg-transparent';
export const FLAT_PRIMARY = 'h-8 rounded-lg shadow-none active:scale-100';
export const FLAT_INPUT = 'h-9 rounded-lg border-border bg-transparent shadow-none dark:bg-transparent';
export const FLAT_SELECT = 'min-h-9 border-border bg-transparent shadow-none dark:bg-transparent';

export const MODE_LABEL: Record<RoadmapWriteBackMode, string> = {
  off: 'Выключено',
  manual: 'По кнопке',
  auto: 'Автоматически',
};

/** AdminCard with optional header actions, used by the integration tabs. */
export function Panel({ title, titleProps, description, icon, actions, children }: {
  title: string;
  titleProps?: ComponentProps<typeof AdminCard>['titleProps'];
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminCard
      title={title}
      titleProps={titleProps}
      description={description}
      icon={icon}
      className={actions ? '[&>div:first-child]:flex-wrap [&>div:first-child>div:first-child]:grow [&>div:first-child>div:first-child]:basis-56' : undefined}
      badge={actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : undefined}
    >
      {children}
    </AdminCard>
  );
}

export function CheckStatusIcon({ status }: { status: 'ok' | 'warning' | 'error' }) {
  if (status === 'ok') return <CheckCircle2 role="img" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="В порядке" />;
  if (status === 'warning') return <AlertTriangle role="img" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Предупреждение" />;
  return <AlertCircle role="img" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Ошибка" />;
}

const CHIP_TONES = {
  muted: { chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
  ok: { chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  warn: { chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  error: { chip: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  info: { chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
};

/** Compact status counter: coloured dot, label and a bold count. */
export function Chip({ tone = 'muted', label, count, title }: { tone?: keyof typeof CHIP_TONES; label: string; count: number; title?: string }) {
  const { chip, dot } = CHIP_TONES[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${chip}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {label}
      <span className="font-semibold tabular-nums">{count}</span>
    </span>
  );
}

export function errorText(error: unknown) {
  return getErrorMessage(error);
}

/** A titled block inside a panel; one topic per block, with a one-line hint under the title. */
export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="px-4 py-5 sm:px-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 id={headingId} className="text-sm font-semibold text-foreground">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function OptionCard({ selected, disabled, children }: { selected: boolean; disabled?: boolean; children: ReactNode }) {
  return <label className={cn('rounded-lg border p-3.5 transition-colors', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', selected ? 'border-primary bg-primary/[0.05] ring-1 ring-primary/30' : 'border-border hover:border-primary/40')}>{children}</label>;
}

/** The only save control of a panel: shows what state the edits are in and keeps the button next to it. */
export function SaveBar({ dirty, saving, notice, error, onSave, onDefaults, defaultsTitle }: {
  dirty: boolean;
  saving: boolean;
  notice: string | null;
  error?: unknown;
  onSave: () => void;
  onDefaults?: () => void;
  defaultsTitle?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <p role={error ? 'alert' : 'status'} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ? errorText(error) : notice ?? (dirty ? 'Есть несохранённые изменения.' : 'Все изменения сохранены.')}
      </p>
      <div className="flex flex-wrap gap-2">
        {onDefaults ? <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg shadow-none active:scale-100" disabled={saving} title={defaultsTitle} onClick={onDefaults}><RotateCcw aria-hidden="true" className="size-3.5" />По умолчанию</Button> : null}
        <Button type="button" size="sm" className={cn(FLAT_PRIMARY, 'gap-1.5')} disabled={!dirty || saving} onClick={onSave}>
          {saving ? <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" /> : <Save aria-hidden="true" className="size-3.5" />}
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}

/** Picks an Azure field by its display name; falls back to a text input until the project's field list is loaded. */
export function FieldPicker({ value, fields, onChange, writableOnly = false }: { value: string; fields: RoadmapAzureField[]; onChange: (value: string) => void; writableOnly?: boolean }) {
  if (!fields.length) return <Input className={FLAT_INPUT} value={value} onChange={(event) => onChange(event.target.value)} />;
  const hasCurrent = fields.some((field) => field.referenceName === value);
  return <SearchableSelect className={FLAT_SELECT} value={value} onChange={onChange} options={[
    ...(!hasCurrent ? [{ value, label: value, leading: <Tag aria-hidden="true" className="size-4" />, triggerDescription: null }] : []),
    ...fields.filter((field) => !writableOnly || !field.readOnly || field.referenceName === value).map((field) => ({ value: field.referenceName, label: field.name, description: field.referenceName, triggerDescription: null, leading: <Tag aria-hidden="true" className="size-4" /> })),
  ]} />;
}

/** Which project's Azure fields fill the pickers below. */
export function FieldSourcePicker({ projects, projectId, onChange, loading, onRefresh }: {
  projects: { id: string; name: string }[];
  projectId: string;
  onChange: (id: string) => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!projects.length) return <p className="text-xs text-muted-foreground">Добавьте проект на вкладке «Проекты», чтобы выбирать поля из списка Azure.</p>;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid w-full max-w-xs min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
        Брать список полей из проекта
        <SearchableSelect className={FLAT_SELECT} value={projectId} onChange={onChange} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
      </label>
      <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={onRefresh} disabled={loading}>
        <RefreshCw aria-hidden="true" className={cn('size-3.5', loading && 'motion-safe:animate-spin')} />Обновить
      </Button>
    </div>
  );
}
