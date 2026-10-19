'use client';

import { AlertCircle, ArrowRight, BookOpen, CheckCircle2, Circle, LoaderCircle, WandSparkles } from 'lucide-react';
import type { RoadmapIntegrationSettings, RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { AdminAlert } from '../AdminLayout';
import { FaqAccordion } from './faq';
import { Panel } from './parts';

type StartTab = 'connection' | 'write-back' | 'projects' | 'webhook';

type WizardStep = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  tab: StartTab;
};

export function AzureSyncStart({
  settings,
  overview,
  loading,
  error,
  onNavigate,
}: {
  settings?: RoadmapIntegrationSettings;
  overview?: RoadmapWriteBackOverview;
  loading: boolean;
  error?: unknown;
  onNavigate: (tab: StartTab) => void;
}) {
  const projects = overview?.projects ?? [];
  const writeChecked = projects.some((project) => project.lastCheck?.some((check) => check.key === 'write' && check.status !== 'error'));
  const readinessPassed = projects.some((project) => project.lastCheck?.length && project.lastCheck.every((check) => check.status !== 'error'));
  const scopeSelected = settings?.writeBack.mode !== 'off'
    && (settings?.writeBack.projectIds === null || Boolean(settings?.writeBack.projectIds?.length));
  const hasSynced = projects.some((project) => project.counts.synced > 0);
  const hasWebhook = projects.some((project) => Boolean(project.lastWebhookAt));
  const steps: WizardStep[] = [
    { id: 'connection', title: 'Подключено к Azure', detail: settings?.configured ? 'Организация и PAT доступны API.' : 'Укажите URL организации и PAT.', done: Boolean(settings?.configured), tab: 'connection' },
    { id: 'write', title: 'PAT умеет писать', detail: writeChecked ? 'Пробная отправка с validateOnly прошла.' : 'Запустите проверку готовности после подключения.', done: writeChecked, tab: 'projects' },
    { id: 'scope', title: 'Выбраны режим и проекты', detail: scopeSelected ? 'Режим записи включён и область выбрана.' : 'Включите ручной или автоматический режим и выберите проект.', done: Boolean(scopeSelected), tab: 'write-back' },
    { id: 'readiness', title: 'Проверка готовности пройдена', detail: readinessPassed ? 'Хотя бы один проект прошёл проверку без ошибок.' : 'На вкладке проектов запустите «Проверить готовность».', done: Boolean(readinessPassed), tab: 'projects' },
    { id: 'synced', title: 'Пробная отправка выполнена', detail: hasSynced ? 'Есть назначение со статусом «В Azure».' : 'Отправьте одно назначение после предпросмотра.', done: hasSynced, tab: 'projects' },
    { id: 'webhook', title: 'Webhook работает', detail: hasWebhook ? 'Получено событие от Azure DevOps.' : 'Создайте подписку и дождитесь первого события.', done: hasWebhook, tab: 'webhook' },
  ];
  const completed = steps.every((step) => step.done);

  return (
    <div className="space-y-5">
      {error ? <AdminAlert tone="error">{error instanceof Error ? error.message : 'Не удалось загрузить состояние интеграции'}</AdminAlert> : null}
      {loading ? <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Загружаем состояние интеграции…</div> : null}

      <Panel title="Начало работы" description="Пройдите короткий чек-лист, затем используйте FAQ для ежедневной работы." icon={<WandSparkles className="h-[18px] w-[18px]" strokeWidth={1.7} />}>
        <div className="space-y-4 p-5">
          {completed ? <AdminAlert tone="success">Мастер пройден. По умолчанию открывается вкладка «Проекты и статус».</AdminAlert> : null}
          {!loading && !settings?.configured ? <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">Подключите Azure DevOps, чтобы открыть остальные вкладки и запустить проверку готовности.</p> : null}
          <ol className="divide-y divide-border rounded-lg border border-border">
            {steps.map((step, index) => <li key={step.id} className="flex items-start gap-3 px-3.5 py-3.5">
              {step.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Готово" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/50" aria-label="Не выполнено" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{index + 1}. {step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
              </div>
              {!step.done ? <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={() => onNavigate(step.tab)}>Перейти <ArrowRight className="h-3.5 w-3.5" /></Button> : null}
            </li>)}
          </ol>
          {!projects.length && settings?.configured ? <p className="flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Импортированных проектов пока нет. Сначала синхронизируйте проект на вкладке «Проекты и статус».</p> : null}
        </div>
      </Panel>

      <Panel title="Частые вопросы" description="Ответы о режимах, полях, факте и безопасной отправке." icon={<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.7} />}>
        <div className="p-5"><FaqAccordion /></div>
      </Panel>
    </div>
  );
}
