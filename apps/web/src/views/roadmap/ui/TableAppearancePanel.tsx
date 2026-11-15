'use client';

import { useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, RotateCcw } from 'lucide-react';
import type { RoadmapTablePreferences } from '@tracker/shared';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { TABLE_PALETTES, getTablePalette, getPalettePreviewProps } from '../model/table-palettes';
import type { TableAppearanceSettingsProps } from './TableAppearanceSettings';

const selectClassName = 'h-9 min-w-0 w-full appearance-none rounded-md border border-border bg-card py-0 pl-3 pr-8 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50';

function Toggle({ label, description, checked, onChange, disabled }: {
  label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  return <label className={cn('flex min-h-10 cursor-pointer items-center justify-between gap-4 py-2 text-sm', disabled && 'cursor-default opacity-45')}>
    <span className="min-w-0"><span className="block">{label}</span>{description ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span> : null}</span>
    <span className="relative h-5 w-9 shrink-0">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default" />
      <span aria-hidden="true" className="absolute inset-0 rounded-full border border-border bg-muted peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card dark:border-muted-foreground/40 dark:peer-checked:border-primary" />
      <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-card shadow-sm peer-checked:translate-x-4 peer-checked:bg-primary-foreground dark:bg-muted-foreground dark:peer-checked:bg-primary-foreground" />
    </span>
  </label>;
}

function ColorControl({ label, value, fallback, onChange }: {
  label: string; value: string | null; fallback: string; onChange: (value: string | null) => void;
}) {
  return <div className="min-w-0 space-y-2">
    <label className="block text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="mt-2 flex h-10 items-center gap-2.5 rounded-md border border-border bg-card px-2.5">
        <input type="color" aria-label={label} value={value ?? fallback} onChange={(event) => onChange(event.target.value)} className="table-color-input size-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <span className="font-mono text-xs text-foreground">{value?.toUpperCase() ?? 'Авто'}</span>
      </span>
    </label>
    <button type="button" onClick={() => onChange(null)} disabled={value === null} aria-label={`Автоматический цвет: ${label.toLowerCase()}`} className="rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">Автоматически</button>
  </div>;
}

function PalettePreview({ palette }: { palette: (typeof TABLE_PALETTES)[number] }) {
  return <span {...getPalettePreviewProps(palette)} aria-hidden="true">
    <span className="palette-preview-head"><span /><span /><span /></span>
    <span className="palette-preview-epic"><i /><span /><span /></span>
    <span className="palette-preview-row"><span /><span /><span /></span>
    <span className="palette-preview-row palette-preview-stripe"><span /><span /><span /></span>
    <span className="palette-preview-footer"><span /><span /><span /></span>
  </span>;
}

export function TableAppearancePanel({ id, preferences, onChange, onReset, status, onRetry, disabled }: TableAppearanceSettingsProps & { id: string }) {
  const content = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<'appearance' | 'columns'>('appearance');
  const selectedPalette = getTablePalette(preferences);
  const errorMessage = disabled ? 'Не удалось загрузить настройки.' : 'Не удалось сохранить настройки.';
  return <>
    <div className="flex shrink-0 gap-6 border-b border-border px-6" role="group" aria-label="Раздел настроек">
      {([['appearance', 'Оформление'], ['columns', 'Столбцы']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={section === value} aria-controls={`${id}-${value}`} onClick={() => { setSection(value); content.current?.scrollTo(0, 0); }} className={cn('-mb-px border-b-2 pb-3 pt-1 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring', section === value ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{label}</button>)}
    </div>
    <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
      <fieldset disabled={disabled || status === 'loading'} className="min-w-0 disabled:opacity-60">
        <div id={`${id}-appearance`} hidden={section !== 'appearance'} className="roadmap-fade-in">
          <section className="pb-5 pt-5" aria-labelledby={`${id}-colors`}>
            <div className="mb-3 flex items-center justify-between gap-2"><h3 id={`${id}-colors`} className="text-sm font-semibold">Цветовая схема</h3>{!selectedPalette ? <span className="text-xs text-muted-foreground">Своя схема</span> : null}</div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3.5">
              {TABLE_PALETTES.map((palette) => {
                const selected = selectedPalette?.id === palette.id;
                return <button key={palette.id} type="button" aria-label={palette.name} aria-pressed={selected} title={palette.description} onClick={() => onChange({ headerTint: palette.headerTint, epicTint: palette.epicTint })} className="group min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">
                  <span className={cn('block overflow-hidden rounded-md border p-1', selected ? 'border-primary ring-1 ring-primary' : 'border-border group-hover:border-muted-foreground/60')}><PalettePreview palette={palette} /></span>
                  <span className={cn('mt-2 flex items-center justify-between gap-1 px-0.5 text-xs', selected ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{palette.name}<Check aria-hidden="true" className={cn('size-3.5 text-primary', !selected && 'invisible')} /></span>
                </button>;
              })}
            </div>
            <details className="group/custom mt-4 border-t border-border pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Свои цвета<ChevronDown aria-hidden="true" className="size-3.5 group-open/custom:rotate-180" /></summary>
              <div className="grid grid-cols-2 gap-4 pb-1 pt-4"><ColorControl label="Шапка таблицы" value={preferences.headerTint} fallback="#64748b" onChange={(headerTint) => onChange({ headerTint })} /><ColorControl label="Эпики и проекты" value={preferences.epicTint} fallback="#64748b" onChange={(epicTint) => onChange({ epicTint })} /></div>
            </details>
          </section>
          <section className="border-t border-border py-5" aria-labelledby={`${id}-density`}>
            <h3 id={`${id}-density`} className="mb-3 text-sm font-semibold">Плотность строк</h3>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1" role="group" aria-label="Плотность таблицы">
              {([['compact', 'Компактно'], ['standard', 'Обычно'], ['comfortable', 'Просторно']] as const).map(([value, label]) => <button key={value} type="button" aria-label={label} aria-pressed={preferences.density === value} onClick={() => onChange({ density: value })} className={cn('flex flex-col items-center gap-1.5 rounded-md px-1 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50', preferences.density === value ? 'bg-card font-medium text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:text-foreground')}><span aria-hidden="true" className={cn('flex h-5 w-7 flex-col justify-center', value === 'compact' ? 'gap-0.5' : value === 'standard' ? 'gap-1' : 'gap-1.5')}><i className="h-px w-full bg-current" /><i className="h-px w-full bg-current" /><i className="h-px w-full bg-current" /></span>{label}</button>)}
            </div>
          </section>
          <section className="space-y-2 border-t border-border py-4" aria-labelledby={`${id}-details`}>
            <h3 id={`${id}-details`} className="pb-1 text-sm font-semibold">Текст и линии</h3>
            <label className="grid min-h-11 grid-cols-2 items-center gap-4 text-sm"><span>Размер текста</span><span className="relative"><select value={preferences.fontSize} onChange={(event) => onChange({ fontSize: event.target.value as RoadmapTablePreferences['fontSize'] })} className={selectClassName}><option value="small">Мелкий</option><option value="standard">Обычный</option><option value="large">Крупный</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" /></span></label>
            <label className="grid min-h-11 grid-cols-2 items-center gap-4 text-sm"><span>Разделители</span><span className="relative"><select value={preferences.separators} onChange={(event) => onChange({ separators: event.target.value as RoadmapTablePreferences['separators'] })} className={selectClassName}><option value="subtle">Мягкие</option><option value="standard">Базовые</option><option value="strong">Контрастные</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" /></span></label>
            <Toggle label="Переносить названия" checked={preferences.wrapTitles} onChange={(wrapTitles) => onChange({ wrapTitles })} />
            <Toggle label="Чередовать фон строк" checked={preferences.stripedRows} onChange={(stripedRows) => onChange({ stripedRows })} />
          </section>
        </div>
        <div id={`${id}-columns`} hidden={section !== 'columns'} className="roadmap-fade-in">
          <section className="py-5" aria-labelledby={`${id}-metrics`}>
            <h3 id={`${id}-metrics`} className="mb-2 text-sm font-semibold">Что показывать</h3><p className="mb-3 text-xs leading-5 text-muted-foreground">Название задачи и план видны всегда.</p>
            <div className="divide-y divide-border/60">
              <Toggle label="Показывать факт" description="Затраченное время рядом с планом" checked={preferences.showFact} onChange={(showFact) => onChange({ showFact })} />
              <Toggle label="Детализация по ролям" description="Показатели для каждой роли проекта" checked={preferences.showRoleDetails} onChange={(showRoleDetails) => onChange({ showRoleDetails })} />
              <Toggle label="Показывать дельту по ролям" description="Разница между фактом и планом" checked={preferences.showDelta} disabled={!preferences.showRoleDetails} onChange={(showDelta) => onChange({ showDelta })} />
              <Toggle label="Только роли с планом" description="Скрыть роли без оценок в этом периоде" checked={preferences.plannedRolesOnly} onChange={(plannedRolesOnly) => onChange({ plannedRolesOnly })} />
            </div>
          </section>
          <section className="space-y-3 border-t border-border py-5">
            <label className="block space-y-3 text-sm font-semibold"><span>Закрепление столбцов</span><span className="relative block"><select value={preferences.pinnedColumns} onChange={(event) => onChange({ pinnedColumns: event.target.value as RoadmapTablePreferences['pinnedColumns'] })} className={selectClassName}><option value="none">Без закрепления</option><option value="name">Закрепить название</option><option value="totals">Название и итоги</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted-foreground" /></span></label>
            <p className="text-xs leading-5 text-muted-foreground">Закреплённые столбцы остаются на месте при горизонтальной прокрутке.</p>
          </section>
          <p className="border-t border-border py-5 text-xs leading-5 text-muted-foreground">Чтобы изменить ширину, потяните границу столбца в шапке таблицы.</p>
        </div>
      </fieldset>
    </div>
    <footer className="shrink-0 space-y-3 border-t border-border bg-card px-6 py-4">
      <div aria-live="polite" className="min-h-4 text-xs">
        {status === 'error' ? <div className="flex items-start justify-between gap-3 text-destructive"><span>{errorMessage}</span><button type="button" onClick={onRetry} className="shrink-0 rounded font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">Повторить</button></div> : <span className="flex items-center gap-1.5 text-muted-foreground">{status === 'saved' ? <Check aria-hidden="true" className="size-3.5" /> : <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />}{status === 'loading' ? 'Загружаем настройки…' : status === 'saving' ? 'Сохраняем…' : 'Настройки сохранены в вашем аккаунте'}</span>}
      </div>
      <Button type="button" variant="outline" className="h-9 w-full gap-2 text-xs" disabled={disabled || status === 'loading'} onClick={onReset}><RotateCcw aria-hidden="true" className="size-3.5" />Вернуть базовый вид</Button>
    </footer>
  </>;
}
