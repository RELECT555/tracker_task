'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LoaderCircle, RotateCcw, Save } from 'lucide-react';
import type { RoadmapWriteBackMode, RoadmapWriteBackOverview, RoadmapWriteBackSettings } from '@/entities/roadmap/api/roadmapApi';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { HelpHint } from './HelpHint';
import { errorText, Panel } from './parts';

export const DEFAULT_WRITE_BACK: RoadmapWriteBackSettings = {
  mode: 'off',
  workItemType: 'Task',
  titleTemplate: '{role}: {title} ({quarter})',
  tagsTemplate: 'Roadmap; Roadmap {quarterKey}; {role}',
  fields: { assignedTo: true, originalEstimate: true, remainingWork: true, iteration: true, areaPath: true, description: true },
  remainingWorkPolicy: 'recalculate',
  projectIds: null,
};

const TOKENS: { token: string; label: string }[] = [
  { token: '{role}', label: 'роль' },
  { token: '{title}', label: 'фича' },
  { token: '{quarter}', label: 'Q4 2026' },
  { token: '{quarterKey}', label: '2026-Q4' },
  { token: '{person}', label: 'участник' },
  { token: '{id}', label: 'ID фичи' },
];

const SAMPLE = { role: 'Backend', title: 'Заявки и маршрут согласования', quarter: 'Q4 2026', quarterKey: '2026-Q4', person: 'Иван Петров', id: '1234' };

function render(template: string) {
  return template.replace(/\{(\w+)\}/g, (match, token: string) => (SAMPLE as Record<string, string>)[token] ?? match).trim();
}

const MODES: { value: RoadmapWriteBackMode; title: string; detail: string }[] = [
  { value: 'off', title: 'Выключено', detail: 'В Azure ничего не пишется. Изменения плана запоминаются как «ожидает» и уйдут после включения.' },
  { value: 'manual', title: 'По кнопке', detail: 'Изменения копятся. Отправляются кнопкой «Отправить в Azure» после предпросмотра. Рекомендуется для старта.' },
  { value: 'auto', title: 'Автоматически', detail: 'Каждое сохранённое назначение сразу уходит в Azure. Накопленные изменения уйдут в течение минуты.' },
];

const FIELDS: { key: keyof RoadmapWriteBackSettings['fields']; title: string; detail: string }[] = [
  { key: 'assignedTo', title: 'Assigned To — исполнитель', detail: 'Участник назначения по email. Смена участника в Roadmap переназначит задачу.' },
  { key: 'originalEstimate', title: 'Original Estimate — оценка', detail: 'Часы на квартал. Нет в процессе Scrum — тогда пропускается.' },
  { key: 'remainingWork', title: 'Remaining Work — остаток', detail: 'Оценка минус списанное. Политику обновления — ниже.' },
  { key: 'iteration', title: 'Iteration Path — итерация квартала', detail: 'Итерация с кварталом в названии или датами на весь квартал; иначе итерация по умолчанию.' },
  { key: 'areaPath', title: 'Area Path — как у фичи', detail: 'Задача попадает в ту же команду/область, что и фича.' },
  { key: 'description', title: 'Описание', detail: 'Пояснение, что задача ведётся из Roadmap и где списывать время.' },
];

export function WriteBackSettingsPanel({ settings, overview }: { settings: RoadmapWriteBackSettings; overview?: RoadmapWriteBackOverview }) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [draft, setDraft] = useState<RoadmapWriteBackSettings>(settings);
  const [notice, setNotice] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const [lastFocused, setLastFocused] = useState<'title' | 'tags'>('title');
  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const projects = overview?.projects ?? [];
  const pendingTotal = projects.reduce((sum, project) => sum + project.counts.pending + project.counts.notSent + project.counts.error + project.counts.conflict, 0);
  const switchingToAuto = draft.mode === 'auto' && settings.mode !== 'auto' && pendingTotal > 0;

  const saveMutation = useMutation({
    mutationFn: () => roadmapApi.saveWriteBackSettings(draft),
    onSuccess: async () => {
      setNotice('Настройки записи сохранены.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'sync-settings-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
      ]);
    },
  });

  const update = (patch: Partial<RoadmapWriteBackSettings>) => {
    setNotice(null);
    if (saveMutation.isError) saveMutation.reset();
    setDraft((current) => ({ ...current, ...patch }));
  };
  const insertToken = (token: string) => {
    const key = lastFocused === 'title' ? 'titleTemplate' : 'tagsTemplate';
    const input = (lastFocused === 'title' ? titleRef : tagsRef).current;
    const value = draft[key];
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    update({ [key]: `${value.slice(0, start)}${token}${value.slice(end)}` } as Partial<RoadmapWriteBackSettings>);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
  };
  const titlePreview = useMemo(() => render(draft.titleTemplate), [draft.titleTemplate]);
  const tagsPreview = useMemo(() => render(draft.tagsTemplate).split(';').map((tag) => tag.trim()).filter(Boolean), [draft.tagsTemplate]);

  return (
    <Panel
      title="Запись плана в Azure DevOps"
      description="Выберите режим отправки, проекты и поля задач. Настройки применяются при следующей отправке."
      actions={<>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={saveMutation.isPending} onClick={() => update({ ...DEFAULT_WRITE_BACK, mode: draft.mode, projectIds: draft.projectIds })} title="Вернуть шаблоны и поля по умолчанию"><RotateCcw aria-hidden="true" className="size-4" />По умолчанию</Button>
        <Button type="button" size="sm" className="gap-1.5" disabled={!dirty || saveMutation.isPending || !draft.titleTemplate.trim() || !draft.workItemType.trim()} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
          {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </>}
    >
      <fieldset disabled={saveMutation.isPending} aria-label="Настройки записи плана" className="min-w-0 divide-y divide-border">
        {saveMutation.error ? <p role="alert" className="px-5 py-3 text-sm text-destructive">{errorText(saveMutation.error)}</p> : null}
        {notice && !dirty ? <p role="status" className="px-5 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
        {dirty ? <p className="bg-amber-500/[0.06] px-5 py-2.5 text-xs text-amber-800 dark:text-amber-200">Есть несохранённые изменения.</p> : null}

        <Section title="Когда отправлять" help="Определяет, когда изменения плана попадут в Azure DevOps." faqId="when-plan-is-filled">
          <div className="grid gap-3 md:grid-cols-3">
            {MODES.map((mode) => <label key={mode.value} className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${draft.mode === mode.value ? 'border-primary bg-primary/[0.05] ring-1 ring-primary/30' : 'border-border hover:border-primary/40'}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input type="radio" name="write-back-mode" className="accent-primary" checked={draft.mode === mode.value} onChange={() => update({ mode: mode.value })} />
                {mode.title}
              </span>
              <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{mode.detail}</span>
            </label>)}
          </div>
          {switchingToAuto ? <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />После сохранения в Azure уйдут накопленные назначения: {pendingTotal}. Если не уверены — сначала отправьте их через предпросмотр на вкладке «Проекты».
          </p> : null}
        </Section>

        <Section title="Проекты для отправки" hint="Для первой проверки можно включить запись только для одного проекта." help="Выберите проекты, для которых разрешена запись задач." faqId="what-is-two-way-sync">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="write-back-scope" className="accent-primary" checked={draft.projectIds === null} onChange={() => update({ projectIds: null })} />Все импортированные проекты</label>
            <label className="flex items-center gap-2"><input type="radio" name="write-back-scope" className="accent-primary" checked={draft.projectIds !== null} onChange={() => update({ projectIds: draft.projectIds ?? [] })} />Только выбранные</label>
          </div>
          {draft.projectIds !== null ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.length ? projects.map((project) => <label key={project.id} className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={draft.projectIds?.includes(project.id) ?? false} onChange={(event) => update({ projectIds: event.target.checked ? [...(draft.projectIds ?? []), project.id] : (draft.projectIds ?? []).filter((id) => id !== project.id) })} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="text-[11px] text-muted-foreground">{project.total} назн.</span>
            </label>) : <p className="text-sm text-muted-foreground">Импортированных проектов пока нет.</p>}
            {draft.projectIds.length === 0 && projects.length ? <p className="text-xs text-amber-700 dark:text-amber-300 sm:col-span-2 lg:col-span-3">Не выбрано ни одного проекта — ничего не будет отправлено.</p> : null}
          </div> : null}
        </Section>

        <Section title="Шаблон задачи" hint="Укажите тип, который существует в проекте Azure DevOps. Обычно это Task." help="Тип, название и теги определяют создаваемую задачу." faqId="what-appears-in-azure">
          <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
            <label className="grid content-start gap-1.5 text-xs font-medium text-muted-foreground">
              Тип задачи
              <Input value={draft.workItemType} maxLength={64} onChange={(event) => update({ workItemType: event.target.value })} className="h-9" placeholder="Task" />
            </label>
            <div className="min-w-0 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor={formId + '-title'} className="text-xs font-medium text-muted-foreground">Шаблон названия</label>
                <Input id={formId + '-title'} ref={titleRef} value={draft.titleTemplate} maxLength={200} onFocus={() => setLastFocused('title')} onChange={(event) => update({ titleTemplate: event.target.value })} className="h-9 font-mono text-[13px]" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={formId + '-tags'} className="text-xs font-medium text-muted-foreground">Теги (через «;»)</label>
                <Input id={formId + '-tags'} ref={tagsRef} value={draft.tagsTemplate} maxLength={200} onFocus={() => setLastFocused('tags')} onChange={(event) => update({ tagsTemplate: event.target.value })} className="h-9 font-mono text-[13px]" placeholder="Roadmap" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Вставить в {lastFocused === 'title' ? 'название' : 'теги'}:</span>
                {TOKENS.map((token) => <Button key={token.token} type="button" size="sm" variant="outline" onClick={() => insertToken(token.token)} className="h-7 px-1.5 font-mono text-[11px]" title={token.label}>{token.token}</Button>)}
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs [overflow-wrap:anywhere]">
                <p className="text-muted-foreground">Пример задачи</p>
                <p className="mt-1 font-medium text-foreground">{draft.workItemType || 'Task'}: {titlePreview || <span className="text-destructive">пустое название</span>}</p>
                {tagsPreview.length ? <div className="mt-1.5 flex flex-wrap gap-1">{tagsPreview.map((tag) => <span key={tag} className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>)}</div> : null}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Поля для заполнения" help="Выберите поля, которые Roadmap будет заполнять при отправке задачи." faqId="custom-fields">
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            {FIELDS.map((field) => <label key={field.key} className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={draft.fields[field.key]} onChange={(event) => update({ fields: { ...draft.fields, [field.key]: event.target.checked } })} />
              <span><span className="block text-sm font-medium text-foreground">{field.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{field.detail}</span></span>
            </label>)}
          </div>
          {!draft.fields.originalEstimate && !draft.fields.remainingWork ? <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Ни одно поле оценки не выбрано — в Azure не будет плановых часов.</p> : null}
        </Section>

        <Section title="Остаток часов в Remaining Work" hint="Применяется, когда в Roadmap меняют оценку уже отправленного назначения." help="Выберите, пересчитывать ли остаток после изменения оценки." faqId="plan-changes">
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ['recalculate', 'Пересчитывать', 'Remaining Work = новая оценка − уже списанное (Completed Work). Остаток всегда соответствует плану.'],
              ['create-only', 'Только при создании', 'Задаётся один раз. Дальше остаток ведут люди в Azure, Roadmap меняет только Original Estimate.'],
            ] as const).map(([value, title, detail]) => <label key={value} className={`cursor-pointer rounded-lg border p-3.5 ${draft.remainingWorkPolicy === value ? 'border-primary bg-primary/[0.05]' : 'border-border hover:border-primary/40'}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-foreground"><input type="radio" name="remaining-policy" className="accent-primary" disabled={!draft.fields.remainingWork} checked={draft.remainingWorkPolicy === value} onChange={() => update({ remainingWorkPolicy: value })} />{title}</span>
              <span className="mt-1.5 block text-xs text-muted-foreground">{detail}</span>
            </label>)}
          </div>
        </Section>
      </fieldset>
    </Panel>
  );
}

function Section({ title, hint, help, faqId, children }: { title: string; hint?: string; help?: string; faqId?: string; children: React.ReactNode }) {
  const headingId = useId();
  // The visible hint already explains the section; the "?" popover is only kept for sections without one.
  return <section aria-labelledby={headingId} className="px-4 py-4 sm:px-5">
    <div className="flex items-center gap-1.5">
      <h3 id={headingId} className="text-sm font-semibold text-foreground">{title}</h3>
      {help && !hint ? <HelpHint text={help} faqId={faqId} /> : null}
    </div>
    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    <div className="mt-3">{children}</div>
  </section>;
}
