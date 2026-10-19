'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, RefreshCw, Webhook } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { baseURL } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { AdminAlert, StatusPill } from '../AdminLayout';
import { errorText, Panel } from './parts';

function webhookUrl() {
  const base = baseURL.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${baseURL}` : baseURL;
  return `${base.replace(/\/$/, '')}/roadmap/webhooks/azure-devops`;
}

export function WebhookPanel({ webhookConfigured }: { webhookConfigured: boolean }) {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const secretMutation = useMutation({
    mutationFn: (rotate: boolean) => rotate ? roadmapApi.rotateWebhookSecret() : roadmapApi.webhookSecret(),
    onSuccess: async (result, rotate) => {
      setSecret(result.secret);
      setNotice(rotate ? 'Секрет обновлён. Замените его во всех подписках Azure DevOps — старый больше не принимается.' : null);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] });
    },
  });

  return (
    <Panel
      title="Webhook: факт из Azure DevOps без кнопки"
      description="Azure DevOps сам сообщает об изменениях work items — факт и состояния обновляются через пару секунд."
      icon={<Webhook className="h-[18px] w-[18px]" strokeWidth={1.7} />}
      actions={<StatusPill active={webhookConfigured} label={webhookConfigured ? 'Секрет создан' : 'Не настроен'} />}
    >
      <div className="space-y-5 px-5 py-5">
        {secretMutation.error ? <AdminAlert tone="error">{errorText(secretMutation.error)}</AdminAlert> : null}
        {notice ? <AdminAlert tone="success">{notice}</AdminAlert> : null}

        <ol className="space-y-4">
          <Step n={1} title="Получите секрет">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={secretMutation.isPending} onClick={() => secretMutation.mutate(false)}>
                <KeyRound className="h-3.5 w-3.5" />{webhookConfigured ? 'Показать секрет' : 'Создать секрет'}
              </Button>
              {webhookConfigured ? <Button type="button" variant="ghost" size="sm" disabled={secretMutation.isPending} onClick={() => secretMutation.mutate(true)}>
                <RefreshCw className="h-3.5 w-3.5" />Сменить секрет
              </Button> : null}
            </div>
          </Step>
          <Step n={2} title="Откройте настройки подписок в каждом проекте">
            <span className="text-foreground">Project settings → Service hooks → Create subscription → Web Hooks</span>
          </Step>
          <Step n={3} title="Создайте подписки на события">
            Work item created, updated, deleted, restored — по одной на событие. Фильтры по типу и области не нужны.
          </Step>
          <Step n={4} title="Укажите URL">
            <CopyField value={webhookUrl()} onCopied={() => setNotice('URL скопирован.')} />
          </Step>
          <Step n={5} title="Добавьте заголовок в HTTP headers">
            {secret ? <CopyField value={`X-Roadmap-Webhook-Secret:${secret}`} onCopied={() => setNotice('Заголовок скопирован.')} /> : <p>Нажмите «{webhookConfigured ? 'Показать' : 'Создать'} секрет» в шаге 1, чтобы получить заголовок.</p>}
          </Step>
          <Step n={6} title="Проверьте">
            Нажмите <span className="text-foreground">Test</span> в подписке: ответ 202 — всё верно, 401 — неверный секрет.
          </Step>
        </ol>

        <div className="rounded-lg bg-muted/50 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Важно знать</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>API должен быть доступен из интернета по этому адресу. Для локальной разработки нужен туннель (например, cloudflared).</li>
            <li>Roadmap не доверяет данным события: он заново читает work item из Azure по API.</li>
            <li>Изменения, которые записал сам Roadmap, тоже приходят сюда и просто обновляют данные — циклов нет.</li>
            <li>Удалённая в Azure задача помечает назначение ошибкой. Фичи с назначениями не удаляются, а получают состояние Deleted.</li>
            <li>Без webhook факт обновляется кнопкой «Загрузить из Azure» на вкладке «Проекты и статус» или «Синхронизировать» на странице плана.</li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{n}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function CopyField({ value, onCopied }: { value: string; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      onCopied();
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-muted/40 py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={value}>{value}</code>
      <button type="button" onClick={copy} aria-label="Скопировать" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
