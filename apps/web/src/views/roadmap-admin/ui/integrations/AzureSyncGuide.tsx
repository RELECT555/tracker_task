import { AlertCircle, AlertTriangle, ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { Panel } from './parts';

const OWNERSHIP: { field: string; owner: 'Roadmap' | 'Azure DevOps'; rule: string }[] = [
  { field: 'Оценка на квартал (Original Estimate)', owner: 'Roadmap', rule: 'Правка в Azure будет перезаписана при следующей отправке плана' },
  { field: 'Исполнитель (Assigned To)', owner: 'Roadmap', rule: 'Правка в Azure будет перезаписана при следующей отправке плана' },
  { field: 'Remaining Work', owner: 'Roadmap', rule: 'В режиме «пересчитывать» = оценка − списанное при каждой смене оценки; в режиме «только при создании» дальше ведётся в Azure' },
  { field: 'Факт (Completed Work)', owner: 'Azure DevOps', rule: 'Люди списывают время в своей задаче. Roadmap только читает и суммирует по фичам и эпикам' },
  { field: 'Название, состояние, описание, комментарии задачи', owner: 'Azure DevOps', rule: 'Roadmap задаёт их один раз при создании и больше не трогает' },
  { field: 'Эпики и фичи', owner: 'Azure DevOps', rule: 'Создать карточку можно из плана. Редактировать название, состояние и иерархию нужно в Azure' },
  { field: 'План по ролям (Roles Estimate)', owner: 'Azure DevOps', rule: 'Отображается рядом с назначениями в плане проекта' },
];

const DO = [
  'Начните с режима «По кнопке» и одного проекта: «Проверить готовность» → «Предпросмотр» → отправка.',
  'Оценки и исполнителей меняйте только в Roadmap.',
  'Время списывайте в Completed Work задачи, созданной Roadmap (тег Roadmap).',
  'Если в Azure используются квартальные итерации, называйте их с кварталом: «2026 Q4» или «Q4-2026».',
  'Настройте webhook, чтобы быстрее получать изменения из Azure и обрабатывать удаления.',
];

const DONT = [
  'Не создавайте вручную задачи для тех же людей под той же фичей — факт посчитается дважды.',
  'Не удаляйте задачи с тегом Roadmap — назначение получит ошибку, и при повторной отправке задача создастся заново.',
  'Не меняйте оценку и исполнителя в Azure — Roadmap их перезапишет.',
  'Не переключайте сразу на «Автоматически» с накопленными изменениями — сначала посмотрите предпросмотр.',
];

const STATUSES: { mark: React.ReactNode; label: string; detail: string }[] = [
  { mark: <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />, label: 'Не отправлено', detail: 'Назначение ещё ни разу не уходило в Azure' },
  { mark: <RefreshCw className="h-3.5 w-3.5 text-amber-600" />, label: 'Ожидает', detail: 'Изменено в Roadmap; уйдёт автоматически или по кнопке' },
  { mark: <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin text-sky-600" />, label: 'Отправляется', detail: 'Задача сейчас обрабатывается очередью отправки' },
  { mark: <Check className="h-3.5 w-3.5 text-emerald-600" />, label: 'В Azure', detail: 'Задача создана и совпадает с планом. На странице плана значка нет — всё в порядке' },
  { mark: <AlertCircle className="h-3.5 w-3.5 text-destructive" />, label: 'Ошибка', detail: 'Azure отклонил запись — текст ошибки виден в назначении и на вкладке «Проекты»' },
  { mark: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />, label: 'Конфликт', detail: 'Поле из правил записи изменили вручную в Azure — выберите действие' },
  { mark: <span className="h-2 w-2 rounded-full border border-muted-foreground/50" />, label: 'Пропущено', detail: 'Демо-участник или проект не включён в запись' },
];

export function AzureSyncGuide() {
  return (
    <div className="space-y-5">
      <Panel title="Как работает синхронизация" description="План ведётся в Roadmap, факт — в Azure DevOps. Каждое назначение превращается в отдельную задачу.">
        <div className="grid gap-3 p-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
          <FlowCard title="Roadmap" lines={['Фича × роль × человек × квартал', 'Оценка в часах']} />
          <FlowArrow label="план" hint="автоматически или по кнопке" />
          <FlowCard title="Azure DevOps · Task под фичей" lines={['Assigned To = человек', 'Original Estimate / Remaining Work = оценка', 'Iteration = квартал, теги Roadmap']} accent />
          <FlowArrow label="факт" hint="каждые 5 минут или по webhook" />
          <FlowCard title="Roadmap" lines={['Completed Work задачи = факт назначения', 'Сумма по фиче и эпику']} />
        </div>
      </Panel>

      <Panel title="Кто за что отвечает" description="Источник правды для каждого поля. Правьте поле там, где оно «живёт».">
        <div className="overflow-x-auto rounded-b-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring" role="region" aria-label="Где менять поля задач" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <colgroup><col className="w-[32%]" /><col className="w-[23%] sm:w-[16%]" /><col /></colgroup>
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr><th scope="col" className="px-3 py-2.5 font-medium sm:px-5">Поле</th><th scope="col" className="px-2 py-2.5 font-medium sm:px-3">Где менять</th><th scope="col" className="px-3 py-2.5 font-medium sm:px-5">Что будет при правке в другом месте</th></tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {OWNERSHIP.map((row) => <tr key={row.field}>
                <th scope="row" className="px-3 py-2.5 font-medium text-foreground sm:px-5">{row.field}</th>
                <td className="px-2 py-2.5 sm:px-3"><span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${row.owner === 'Roadmap' ? 'bg-primary/10 text-primary' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'}`}>{row.owner}</span></td>
                <td className="px-3 py-2.5 text-muted-foreground sm:px-5">{row.rule}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Как делать правильно">
          <ul className="space-y-2.5 p-5 text-sm">
            {DO.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span className="text-foreground/90">{item}</span></li>)}
          </ul>
        </Panel>
        <Panel title="Чего не делать">
          <ul className="space-y-2.5 p-5 text-sm">
            {DONT.map((item) => <li key={item} className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span className="text-foreground/90">{item}</span></li>)}
          </ul>
        </Panel>
      </div>

      <Panel title="Статусы назначений" description="Значки на назначениях на странице плана.">
        <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
          {STATUSES.map((status) => <li key={status.label} className="space-y-1 rounded-lg border border-border/70 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground"><span className="inline-flex h-4 w-4 items-center justify-center">{status.mark}</span>{status.label}</p>
            <p className="text-xs text-muted-foreground">{status.detail}</p>
          </li>)}
        </ul>
      </Panel>

      <Panel title="Как включить отправку назначений в Azure">
        <ol className="grid gap-3 p-5 text-sm sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['PAT с правами записи', '«Настройки подключения»: Work Items — Read & Write'],
            ['Отправка', 'Режим «По кнопке», один проект. Вид задачи настраивается на вкладке «Шаблоны задач».'],
            ['Проверка готовности', 'На вкладке «Проекты» откройте «Подробности синхронизации» и нажмите «Проверить готовность».'],
            ['Предпросмотр и отправка', 'Проверьте список и отправьте выбранные назначения'],
            ['Webhook', 'Чтобы быстрее получать изменения из Azure и видеть конфликты'],
          ].map(([title, detail], index) => <li key={title} className="rounded-lg border border-border/70 p-3">
            <p className="text-xs font-semibold text-primary">Шаг {index + 1}</p>
            <p className="mt-1 font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </li>)}
        </ol>
      </Panel>
    </div>
  );
}

function FlowCard({ title, lines, accent }: { title: string; lines: string[]; accent?: boolean }) {
  return <div className={`rounded-lg border p-3.5 ${accent ? 'border-sky-500/30 bg-sky-500/[0.05]' : 'border-primary/25 bg-primary/[0.04]'}`}>
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
  </div>;
}

function FlowArrow({ label, hint }: { label: string; hint: string }) {
  return <div className="flex items-center justify-center gap-2 py-1 text-center lg:flex-col lg:px-1">
    <ArrowRight className="h-5 w-5 rotate-90 text-muted-foreground lg:rotate-0" />
    <div><p className="text-xs font-semibold text-foreground">{label}</p><p className="max-w-28 text-[10px] leading-tight text-muted-foreground">{hint}</p></div>
  </div>;
}
