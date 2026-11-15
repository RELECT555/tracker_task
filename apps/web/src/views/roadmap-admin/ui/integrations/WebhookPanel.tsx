'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Copy, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
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
      title="Webhook для Azure DevOps"
      description="Обновляет фактические часы и статусы задач автоматически после изменений в Azure DevOps."
      actions={<><StatusPill active={webhookConfigured} label={webhookConfigured ? 'Секрет создан' : 'Секрет не создан'} /></>}
    >
      <div className="space-y-5 p-4 sm:p-5">
        {secretMutation.error ? <AdminAlert tone="error">{errorText(secretMutation.error)}</AdminAlert> : null}
        {notice ? <AdminAlert tone="success">{notice}</AdminAlert> : null}

        <ol className="space-y-4">
          <Step n={1} title="Получите секрет">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={secretMutation.isPending} onClick={() => {
                setNotice(null);
                if (secret) setSecret(null);
                else secretMutation.mutate(false);
              }}>
                {secretMutation.isPending && !secretMutation.variables ? <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" /> : <KeyRound aria-hidden="true" className="size-3.5" />}
                {secret ? 'Скрыть секрет' : webhookConfigured ? 'Показать секрет' : 'Создать секрет'}
              </Button>
              {webhookConfigured ? <Button type="button" variant="ghost" size="sm" disabled={secretMutation.isPending} onClick={() => { setNotice(null); secretMutation.mutate(true); }}>
                <RefreshCw aria-hidden="true" className={secretMutation.isPending && secretMutation.variables ? 'size-3.5 motion-safe:animate-spin' : 'size-3.5'} />Сменить секрет
              </Button> : null}
            </div>
          </Step>
          <Step n={2} title="Создайте подписки в каждом проекте">
            <span className="text-foreground">Project settings → Service hooks → Create subscription → Web Hooks.</span> События: work item created, updated, deleted, restored — по одной подписке на событие, без фильтров.
          </Step>
          <Step n={3} title="Укажите URL">
            <CopyField label="Скопировать URL webhook" value={webhookUrl()} />
          </Step>
          <Step n={4} title="Добавьте заголовок в HTTP headers">
            {secret ? <CopyField key={secret} label="Скопировать заголовок с секретом" value={`X-Roadmap-Webhook-Secret:${secret}`} /> : <p>Получите секрет на первом шаге, чтобы увидеть заголовок.</p>}
          </Step>
          <Step n={5} title="Проверьте">
            Нажмите <span className="text-foreground">Test</span> в подписке: ответ 202 — всё верно, 401 — неверный секрет.
          </Step>
        </ol>

        <details className="group border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          <summary className="inline-flex min-h-7 cursor-pointer list-none items-center gap-1.5 rounded font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden="true" className="size-3.5 group-open:rotate-180" /> Важно знать
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>API должен быть доступен из интернета по этому адресу. Для локальной разработки нужен туннель (например, cloudflared).</li>
            <li>Roadmap не доверяет данным события: он заново читает work item из Azure по API.</li>
            <li>Изменения, которые записал сам Roadmap, тоже приходят сюда и просто обновляют данные — циклов нет.</li>
            <li>Удалённая в Azure задача помечает назначение ошибкой. Фичи с назначениями не удаляются, а получают состояние Deleted.</li>
            <li>Факт также можно обновить вручную на вкладке «Проекты» или на странице плана.</li>
          </ul>
        </details>
      </div>
    </Panel>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{n}</span>
      <div className="min-w-0 flex-1 text-sm">
        <h3 className="font-medium text-foreground">{title}</h3>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pl-3 pr-1">
        <code className="min-w-0 flex-1 select-all font-mono text-xs text-foreground [overflow-wrap:anywhere]">{value}</code>
        <Button type="button" variant="ghost" size="icon" onClick={() => void copy()} aria-label={label} className="size-8 shrink-0">
          <Copy aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      {copyStatus === 'failed' ? <p role="alert" className="text-xs text-destructive">Выделите и скопируйте текст вручную.</p> : null}
      <p role="status" className="text-xs text-muted-foreground empty:hidden">{copyStatus === 'copied' ? 'Скопировано.' : null}</p>
    </div>
  );
}
