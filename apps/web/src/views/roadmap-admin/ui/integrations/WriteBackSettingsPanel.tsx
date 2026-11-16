'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, LoaderCircle, RotateCcw, Save } from 'lucide-react';
import type { RoadmapWriteBackMode, RoadmapWriteBackOverview, RoadmapWriteBackSettings } from '@/entities/roadmap/api/roadmapApi';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { HelpHint } from './HelpHint';
import { errorText, FLAT_INPUT, FLAT_OUTLINE, FLAT_PRIMARY, Panel } from './parts';

export const DEFAULT_WRITE_BACK: RoadmapWriteBackSettings = {
  mode: 'off',
  workItemType: 'Task',
  titleTemplate: '{role}: {title} ({quarter})',
  tagsTemplate: 'Roadmap; Roadmap {quarterKey}; {role}',
  fields: { assignedTo: true, originalEstimate: true, remainingWork: true, iteration: true, areaPath: true, description: true },
  remainingWorkPolicy: 'recalculate',
  projectIds: null,
};

/** Placeholders a user can drop into the title or tags; `chip` is the plain-language button label. */
const TOKENS: { token: string; chip: string; hint: string }[] = [
  { token: '{role}', chip: 'Роль', hint: 'Например, Backend' },
  { token: '{title}', chip: 'Название фичи', hint: 'Название фичи из плана' },
  { token: '{quarter}', chip: 'Квартал', hint: 'Например, Q4 2026' },
  { token: '{quarterKey}', chip: 'Квартал (2026-Q4)', hint: 'Короткая запись квартала для тегов' },
  { token: '{person}', chip: 'Участник', hint: 'Имя участника' },
  { token: '{id}', chip: 'Номер фичи', hint: 'ID фичи в Azure DevOps' },
];

const SAMPLE = { role: 'Backend', title: 'Заявки и маршрут согласования', quarter: 'Q4 2026', quarterKey: '2026-Q4', person: 'Иван Петров', id: '1234' };

function render(template: string) {
  return template.replace(/\{(\w+)\}/g, (match, token: string) => (SAMPLE as Record<string, string>)[token] ?? match).trim();
}

const MODES: { value: RoadmapWriteBackMode; title: string; detail: string; badge?: string }[] = [
  { value: 'off', title: 'Выключено', detail: 'Roadmap ничего не пишет в Azure. Изменения запоминаются и уйдут, когда вы включите отправку.' },
  { value: 'manual', title: 'По кнопке', detail: 'Вы сами нажимаете «Отправить в Azure» и перед этим видите, что именно уйдёт.', badge: 'Рекомендуем для старта' },
  { value: 'auto', title: 'Автоматически', detail: 'Каждое изменение плана уходит в Azure само, обычно в течение минуты.' },
];

const FIELDS: { key: keyof RoadmapWriteBackSettings['fields']; title: string; detail: string; azureName: string }[] = [
  { key: 'assignedTo', title: 'Исполнитель', detail: 'Задача назначается на участника из плана. Если участника сменят, задача переназначится.', azureName: 'Assigned To' },
  { key: 'originalEstimate', title: 'Плановые часы', detail: 'Сколько часов выделено на квартал. Если в вашем процессе Azure такого поля нет, оно пропустится.', azureName: 'Original Estimate' },
  { key: 'remainingWork', title: 'Оставшиеся часы', detail: 'Плановые часы за вычетом уже списанных.', azureName: 'Remaining Work' },
  { key: 'iteration', title: 'Итерация квартала', detail: 'Задача попадёт в итерацию нужного квартала. Если такой нет, возьмём итерацию по умолчанию.', azureName: 'Iteration Path' },
  { key: 'areaPath', title: 'Команда', detail: 'Задача попадёт в ту же команду, что и фича.', azureName: 'Area Path' },
  { key: 'description', title: 'Описание', detail: 'Короткая пометка, что задача ведётся из Roadmap и где списывать время.', azureName: 'Description' },
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
      setNotice('Настройки сохранены.');
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
      title="Отправка плана в Azure DevOps"
      description="Выберите, когда и что Roadmap будет создавать в Azure. Изменения применятся со следующей отправки."
      actions={<>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg shadow-none active:scale-100" disabled={saveMutation.isPending} onClick={() => update({ ...DEFAULT_WRITE_BACK, mode: draft.mode, projectIds: draft.projectIds })} title="Вернуть название, теги и поля к значениям по умолчанию"><RotateCcw aria-hidden="true" className="size-4" />По умолчанию</Button>
        <Button type="button" size="sm" className={cn(FLAT_PRIMARY, 'gap-1.5')} disabled={!dirty || saveMutation.isPending || !draft.titleTemplate.trim() || !draft.workItemType.trim()} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
          {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </>}
    >
      <fieldset disabled={saveMutation.isPending} aria-label="Настройки отправки плана" className="min-w-0 divide-y divide-border">
        {saveMutation.error ? <p role="alert" className="px-5 py-3 text-sm text-destructive">{errorText(saveMutation.error)}</p> : null}
        {notice && !dirty ? <p role="status" className="px-5 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
        {dirty ? <p className="bg-amber-500/[0.06] px-5 py-2.5 text-xs text-amber-800 dark:text-amber-200">Есть несохранённые изменения.</p> : null}

        <Section title="Когда отправлять" help="Определяет, когда изменения плана попадут в Azure DevOps." faqId="when-plan-is-filled">
          <div className="grid gap-3 md:grid-cols-3">
            {MODES.map((mode) => <OptionCard key={mode.value} selected={draft.mode === mode.value}>
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input type="radio" name="write-back-mode" className="accent-primary" checked={draft.mode === mode.value} onChange={() => update({ mode: mode.value })} />
                {mode.title}
              </span>
              {mode.badge ? <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{mode.badge}</span> : null}
              <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{mode.detail}</span>
            </OptionCard>)}
          </div>
          {switchingToAuto ? <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />После сохранения в Azure сразу уйдут накопленные изменения: {pendingTotal}. Если не уверены, сначала проверьте их на вкладке «Проекты» кнопкой «Отправить в Azure».
          </p> : null}
        </Section>

        <Section title="Для каких проектов" hint="Для первой проверки включите отправку только для одного проекта." help="Выберите проекты, для которых разрешена отправка." faqId="what-is-two-way-sync">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="write-back-scope" className="accent-primary" checked={draft.projectIds === null} onChange={() => update({ projectIds: null })} />Все добавленные проекты</label>
            <label className="flex items-center gap-2"><input type="radio" name="write-back-scope" className="accent-primary" checked={draft.projectIds !== null} onChange={() => update({ projectIds: draft.projectIds ?? [] })} />Только выбранные</label>
          </div>
          {draft.projectIds !== null ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.length ? projects.map((project) => <label key={project.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <input type="checkbox" className="accent-primary" checked={draft.projectIds?.includes(project.id) ?? false} onChange={(event) => update({ projectIds: event.target.checked ? [...(draft.projectIds ?? []), project.id] : (draft.projectIds ?? []).filter((id) => id !== project.id) })} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{project.total}</span>
            </label>) : <p className="text-sm text-muted-foreground">Добавленных проектов пока нет.</p>}
            {draft.projectIds.length === 0 && projects.length ? <p className="text-xs text-amber-700 dark:text-amber-300 sm:col-span-2 lg:col-span-3">Не выбрано ни одного проекта, поэтому ничего не будет отправлено.</p> : null}
          </div> : null}
        </Section>

        <Section title="Что заполнять в задаче" hint="Отметьте, какие данные Roadmap передаст в созданную задачу Azure." help="Выберите поля, которые Roadmap заполнит при отправке." faqId="custom-fields">
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {FIELDS.map((field) => <label key={field.key} title={`Поле в Azure: ${field.azureName}`} className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={draft.fields[field.key]} onChange={(event) => update({ fields: { ...draft.fields, [field.key]: event.target.checked } })} />
              <span><span className="block text-sm font-medium text-foreground">{field.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{field.detail}</span></span>
            </label>)}
          </div>
          {!draft.fields.originalEstimate && !draft.fields.remainingWork ? <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Часы не выбраны, поэтому плановые часы в Azure не попадут.</p> : null}
        </Section>

        <Section title="Как будет выглядеть задача" hint="Так задача появится в Azure с текущими настройками. Для примера взяты вымышленные данные.">
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm [overflow-wrap:anywhere]">
            <p className="font-medium text-foreground">{titlePreview || <span className="text-destructive">Название пустое — заполните шаблон в «Дополнительно»</span>}</p>
            {tagsPreview.length ? <div className="mt-2 flex flex-wrap gap-1.5">{tagsPreview.map((tag) => <span key={tag} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">{tag}</span>)}</div> : null}
          </div>

          <details className="group mt-4">
            <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              Дополнительно: название, теги и остаток часов
            </summary>
            <div className="mt-3 space-y-5 rounded-lg border border-border p-4">
              <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                <label className="grid content-start gap-1.5 text-xs font-medium text-muted-foreground">
                  Тип задачи в Azure
                  <Input value={draft.workItemType} maxLength={64} onChange={(event) => update({ workItemType: event.target.value })} className={FLAT_INPUT} placeholder="Task" />
                  <span className="font-normal">Обычно Task. Менять нужно, только если в проекте другой тип.</span>
                </label>
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor={formId + '-title'} className="text-xs font-medium text-muted-foreground">Название задачи</label>
                    <Input id={formId + '-title'} ref={titleRef} value={draft.titleTemplate} maxLength={200} onFocus={() => setLastFocused('title')} onChange={(event) => update({ titleTemplate: event.target.value })} className={cn(FLAT_INPUT, 'font-mono text-[13px]')} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={formId + '-tags'} className="text-xs font-medium text-muted-foreground">Теги (через «;»)</label>
                    <Input id={formId + '-tags'} ref={tagsRef} value={draft.tagsTemplate} maxLength={200} onFocus={() => setLastFocused('tags')} onChange={(event) => update({ tagsTemplate: event.target.value })} className={cn(FLAT_INPUT, 'font-mono text-[13px]')} placeholder="Roadmap" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Добавить в {lastFocused === 'title' ? 'название' : 'теги'}:</span>
                    {TOKENS.map((token) => <Button key={token.token} type="button" size="sm" variant="outline" onClick={() => insertToken(token.token)} className={cn(FLAT_OUTLINE, 'h-7 px-2 text-[11px]')} title={token.hint}>{token.chip}</Button>)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Если оценку изменят позже</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">Что делать с оставшимися часами, когда в Roadmap поменяли оценку уже отправленной задачи.{!draft.fields.remainingWork ? ' Сейчас недоступно: оставшиеся часы не заполняются.' : ''}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {([
                    ['recalculate', 'Пересчитывать', 'Остаток всегда равен плану минус списанное время.'],
                    ['create-only', 'Задать один раз', 'Остаток ставится при создании, дальше его ведёте вы в Azure.'],
                  ] as const).map(([value, title, detail]) => <OptionCard key={value} selected={draft.remainingWorkPolicy === value} disabled={!draft.fields.remainingWork}>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground"><input type="radio" name="remaining-policy" className="accent-primary" disabled={!draft.fields.remainingWork} checked={draft.remainingWorkPolicy === value} onChange={() => update({ remainingWorkPolicy: value })} />{title}</span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">{detail}</span>
                  </OptionCard>)}
                </div>
              </div>
            </div>
          </details>
        </Section>
      </fieldset>
    </Panel>
  );
}

function OptionCard({ selected, disabled, children }: { selected: boolean; disabled?: boolean; children: React.ReactNode }) {
  return <label className={cn('rounded-lg border p-3.5 transition-colors', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', selected ? 'border-primary bg-primary/[0.05] ring-1 ring-primary/30' : 'border-border hover:border-primary/40')}>{children}</label>;
}

function Section({ title, hint, help, faqId, children }: { title: string; hint?: string; help?: string; faqId?: string; children: React.ReactNode }) {
  const headingId = useId();
  // The visible hint already explains the section; the "?" popover is only kept for sections without one.
  return <section aria-labelledby={headingId} className="px-4 py-5 sm:px-5">
    <div className="flex items-center gap-1.5">
      <h3 id={headingId} className="text-sm font-semibold text-foreground">{title}</h3>
      {help && !hint ? <HelpHint text={help} faqId={faqId} /> : null}
    </div>
    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    <div className="mt-3">{children}</div>
  </section>;
}
