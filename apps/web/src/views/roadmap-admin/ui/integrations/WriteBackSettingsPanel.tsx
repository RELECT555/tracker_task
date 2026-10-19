'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LoaderCircle, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import type { RoadmapWriteBackMode, RoadmapWriteBackOverview, RoadmapWriteBackSettings } from '@/entities/roadmap/api/roadmapApi';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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
  const [draft, setDraft] = useState<RoadmapWriteBackSettings>(settings);
  const [notice, setNotice] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const [lastFocused, setLastFocused] = useState<'title' | 'tags'>('title');
  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const projects = overview?.projects ?? [];
  const pendingTotal = projects.reduce((sum, project) => sum + project.counts.pending + project.counts.notSent + project.counts.error, 0);
  const switchingToAuto = draft.mode === 'auto' && settings.mode !== 'auto' && pendingTotal > 0;

  const saveMutation = useMutation({
    mutationFn: () => roadmapApi.saveWriteBackSettings(draft),
    onSuccess: async () => {
      setNotice('Настройки записи сохранены.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
      ]);
    },
  });

  const update = (patch: Partial<RoadmapWriteBackSettings>) => { setNotice(null); setDraft((current) => ({ ...current, ...patch })); };
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
      title="Настройки записи плана в Azure DevOps"
      description="Что, когда и куда Roadmap пишет в Azure. Изменения применяются к следующей отправке; уже созданные задачи не пересоздаются."
      icon={<SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.7} />}
      actions={<>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => update({ ...DEFAULT_WRITE_BACK, mode: draft.mode, projectIds: draft.projectIds })} title="Вернуть шаблоны и поля по умолчанию (режим и проекты не меняются)"><RotateCcw className="h-4 w-4" />По умолчанию</Button>
        <Button type="button" size="sm" className="gap-1.5" disabled={!dirty || saveMutation.isPending || !draft.titleTemplate.trim() || !draft.workItemType.trim()} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Сохранить
        </Button>
      </>}
    >
      <div className="divide-y divide-border">
        {saveMutation.error ? <p role="alert" className="px-5 py-3 text-sm text-destructive">{errorText(saveMutation.error)}</p> : null}
        {notice && !dirty ? <p role="status" className="px-5 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
        {dirty ? <p className="bg-amber-500/[0.06] px-5 py-2.5 text-xs text-amber-800 dark:text-amber-200">Есть несохранённые изменения.</p> : null}

        <Section title="1. Когда отправлять">
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

        <Section title="2. Какие проекты" hint="Ограничьте запись, чтобы безопасно опробовать её на одном проекте.">
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

        <Section title="3. Что создавать" hint="Тип должен существовать в процессе проекта. Обычно это Task.">
          <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">Тип work item
              <Input value={draft.workItemType} maxLength={64} onChange={(event) => update({ workItemType: event.target.value })} className="h-9" placeholder="Task" />
            </label>
            <div className="space-y-3">
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Шаблон названия
                <Input ref={titleRef} value={draft.titleTemplate} maxLength={200} onFocus={() => setLastFocused('title')} onChange={(event) => update({ titleTemplate: event.target.value })} className="h-9 font-mono text-[13px]" />
              </label>
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Теги (через «;»)
                <Input ref={tagsRef} value={draft.tagsTemplate} maxLength={200} onFocus={() => setLastFocused('tags')} onChange={(event) => update({ tagsTemplate: event.target.value })} className="h-9 font-mono text-[13px]" placeholder="Roadmap" />
              </label>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Вставить в {lastFocused === 'title' ? 'название' : 'теги'}:</span>
                {TOKENS.map((token) => <button key={token.token} type="button" onClick={() => insertToken(token.token)} className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:border-primary/50 hover:bg-primary/5" title={token.label}>{token.token}</button>)}
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
                <p className="text-muted-foreground">Пример задачи</p>
                <p className="mt-1 font-medium text-foreground">{draft.workItemType || 'Task'}: {titlePreview || <span className="text-destructive">пустое название</span>}</p>
                {tagsPreview.length ? <div className="mt-1.5 flex flex-wrap gap-1">{tagsPreview.map((tag) => <span key={tag} className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>)}</div> : null}
                <p className="mt-1.5 text-[11px] text-muted-foreground">Тег Roadmap помогает отличать такие задачи и строить по ним запросы в Azure. Рекомендуем его оставить.</p>
              </div>
            </div>
          </div>
        </Section>

        <Section title="4. Какие поля заполнять">
          <div className="grid gap-2 md:grid-cols-2">
            {FIELDS.map((field) => <label key={field.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 p-3">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={draft.fields[field.key]} onChange={(event) => update({ fields: { ...draft.fields, [field.key]: event.target.checked } })} />
              <span><span className="block text-sm font-medium text-foreground">{field.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{field.detail}</span></span>
            </label>)}
          </div>
          {!draft.fields.originalEstimate && !draft.fields.remainingWork ? <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Ни одно поле оценки не выбрано — в Azure не будет плановых часов.</p> : null}
        </Section>

        <Section title="5. Как обновлять Remaining Work" hint="Применяется, когда в Roadmap меняют оценку уже отправленного назначения.">
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
      </div>
    </Panel>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="px-5 py-4">
    <p className="text-sm font-semibold text-foreground">{title}</p>
    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    <div className="mt-3">{children}</div>
  </div>;
}
