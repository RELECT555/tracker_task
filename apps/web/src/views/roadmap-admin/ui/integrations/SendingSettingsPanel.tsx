'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { syncSettingsV2Schema, type SyncSettingsV2 } from '@tracker/shared';
import { roadmapApi, type RoadmapWriteBackMode, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { HelpHint } from './HelpHint';
import { FLAT_INPUT, FLAT_OUTLINE, FLAT_SELECT, OptionCard, Panel, SaveBar, Section, errorText } from './parts';
import { useSyncSettingsEditor } from './useSyncSettingsEditor';

const KEYS = ['mode', 'projectIds', 'conflictPolicy', 'removalPolicy', 'pushPermission'] as const;
const FIELD_LABEL = 'grid min-w-0 content-start gap-1.5 text-xs font-medium text-muted-foreground';

const MODES: { value: RoadmapWriteBackMode; title: string; detail: string; badge?: string }[] = [
  { value: 'off', title: 'Выключено', detail: 'Roadmap ничего не пишет в Azure. Изменения запоминаются и уйдут, когда вы включите отправку.' },
  { value: 'manual', title: 'По кнопке', detail: 'Вы сами нажимаете «Отправить в Azure» и перед этим видите, что именно уйдёт.', badge: 'Рекомендуем для старта' },
  { value: 'auto', title: 'Автоматически', detail: 'Каждое изменение плана уходит в Azure само, обычно в течение минуты.' },
];

/** When and where the plan is sent, and what happens when Roadmap and Azure disagree. What a created task looks like lives in "Шаблоны задач". */
export function SendingSettingsPanel({ overview }: { overview?: RoadmapWriteBackOverview }) {
  const editor = useSyncSettingsEditor(KEYS);
  const { draft, update } = editor;
  const projects = overview?.projects ?? [];
  const pendingTotal = projects.reduce((sum, project) => sum + project.counts.pending + project.counts.notSent + project.counts.error + project.counts.conflict, 0);
  const switchingToAuto = Boolean(draft && draft.mode === 'auto' && overview?.settings.mode !== 'auto' && pendingTotal > 0);

  return (
    <Panel title="Отправка плана в Azure DevOps" description="Когда и куда Roadmap отправляет план. Как выглядит созданная задача — на вкладке «Шаблоны задач».">
      {!draft ? <p role="status" className="p-5 text-sm text-muted-foreground">Загружаем настройки…</p> : (
        <fieldset disabled={editor.saving} aria-label="Настройки отправки плана" className="min-w-0 divide-y divide-border">
          <Section title="Когда отправлять">
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

          <Section title="Для каких проектов" hint="Для первой проверки включите отправку только для одного проекта.">
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

          <Section title="Если данные расходятся" hint="Что делать, если одно и то же изменили и в Roadmap, и в Azure, или убрали назначение.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={FIELD_LABEL}>
                Оценку изменили и в Roadmap, и в Azure
                <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.conflictPolicy} onChange={(next) => update({ conflictPolicy: next as SyncSettingsV2['conflictPolicy'] })} options={[
                  { value: 'overwrite', label: 'Оставить значение Roadmap', description: 'Azure перезапишется при отправке' },
                  { value: 'skip-field', label: 'Взять значение из Azure', description: 'План в Roadmap заменится' },
                  { value: 'stop', label: 'Остановиться и спросить', description: 'Назначение помечается «Расходится с Azure»' },
                ]} />
              </label>
              <label className={FIELD_LABEL}>
                Назначение удалили или обнулили часы
                <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.removalPolicy.action} onChange={(next) => update({ removalPolicy: { ...draft.removalPolicy, action: next as SyncSettingsV2['removalPolicy']['action'] } })} options={[
                  { value: 'keep', label: 'Оставить задачу в Azure' },
                  { value: 'set-state', label: 'Перевести задачу в другое состояние' },
                  { value: 'delete', label: 'Удалить задачу', description: 'Попадёт в корзину Azure, её можно восстановить' },
                ]} />
              </label>
              {draft.removalPolicy.action === 'set-state' ? <label className={FIELD_LABEL}>
                В какое состояние перевести
                <Input className={FLAT_INPUT} value={draft.removalPolicy.state ?? ''} placeholder="Removed" onChange={(event) => update({ removalPolicy: { ...draft.removalPolicy, state: event.target.value } })} />
                <span className="font-normal">Название состояния так, как оно называется в вашем Azure.</span>
              </label> : null}
            </div>
          </Section>

          <Section title="Кто может отправлять вручную">
            <label className={cn(FIELD_LABEL, 'max-w-sm')}>
              <span className="sr-only">Кто может отправлять вручную</span>
              <SearchableSelect className={FLAT_SELECT} searchable={false} value={draft.pushPermission} onChange={(next) => update({ pushPermission: next === 'admins' ? 'admins' : 'planners' })} options={[{ value: 'planners', label: 'Пользователи Roadmap' }, { value: 'admins', label: 'Только администраторы' }]} />
            </label>
          </Section>

          <SaveBar dirty={editor.dirty} saving={editor.saving} notice={editor.notice} error={editor.saveError} onSave={editor.save} />
        </fieldset>
      )}
      <SettingsTransfer />
    </Panel>
  );
}

/** Whole-settings backup: covers every tab, so it saves immediately instead of joining one tab's draft. */
function SettingsTransfer() {
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const exportSettings = async () => {
    const settings = await queryClient.fetchQuery({ queryKey: ['roadmap', 'sync-settings-v2'], queryFn: roadmapApi.syncSettingsV2 });
    const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'roadmap-sync-settings.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  const importSettings = async (file: File) => {
    try {
      const imported: unknown = JSON.parse(await file.text());
      const parsed = imported && typeof imported === 'object' && !Array.isArray(imported) ? syncSettingsV2Schema.safeParse(imported) : null;
      if (!parsed?.success) {
        setMessage({ text: 'Выберите файл, который вы ранее сохранили кнопкой «Сохранить в файл».', error: true });
        return;
      }
      const saved = await roadmapApi.saveSyncSettingsV2(parsed.data);
      queryClient.setQueryData(['roadmap', 'sync-settings-v2'], saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
      ]);
      setMessage({ text: 'Настройки загружены и сохранены на всех вкладках.', error: false });
    } catch (cause) {
      setMessage({ text: cause instanceof SyntaxError ? 'Не удалось прочитать файл.' : errorText(cause), error: true });
    }
  };

  return (
    <details className="group border-t border-border px-4 py-4 sm:px-5">
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        Перенос настроек между стендами
        <HelpHint text="Файл содержит настройки всех вкладок: отправку, шаблоны и данные из Azure. Загрузка сразу заменяет текущие настройки." />
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={() => void exportSettings()}><Download aria-hidden="true" className="size-3.5" />Сохранить в файл</Button>
        <Button type="button" variant="outline" size="sm" className={cn(FLAT_OUTLINE, 'gap-1.5')} onClick={() => importRef.current?.click()}><Upload aria-hidden="true" className="size-3.5" />Загрузить из файла</Button>
        <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importSettings(file);
          event.target.value = '';
        }} />
      </div>
      {message ? <p role={message.error ? 'alert' : 'status'} className={cn('mt-2 text-xs', message.error ? 'text-destructive' : 'text-muted-foreground')}>{message.text}</p> : null}
    </details>
  );
}
