'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Cloud, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { roadmapApi, type RoadmapIntegrationSettings } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { AdminAlert, StatusPill } from '../AdminLayout';
import { errorText } from './parts';

export function AzureConnectionPanel({ settings, openFromLink, onFirstConnect }: {
  settings: RoadmapIntegrationSettings;
  openFromLink: boolean;
  onFirstConnect: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [organizationDraft, setOrganizationDraft] = useState<string | null>(null);
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const organizationField = useRef<HTMLInputElement>(null);
  const organizationUrl = organizationDraft ?? settings.organizationUrl;
  const editing = !settings.configured || expanded;

  useEffect(() => {
    if (!openFromLink) return;
    setExpanded(true);
    const frame = requestAnimationFrame(() => {
      organizationField.current?.focus({ preventScroll: true });
      document.getElementById('azure-connection')?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [openFromLink]);

  const saveMutation = useMutation({
    mutationFn: roadmapApi.saveIntegrationSettings,
    onSuccess: async (result) => {
      setOrganizationDraft(null);
      setPat('');
      setShowPat(false);
      setSaveNotice(settings.configured ? 'Изменения сохранены.' : 'Настройки подключения сохранены. Теперь можно добавить проект.');
      if (!settings.configured && result.configured) {
        setExpanded(false);
        onFirstConnect();
      }
      queryClient.setQueryData(['roadmap', 'integration', 'azure-devops'], result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'connection'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
      ]);
    },
  });
  const testMutation = useMutation({ mutationFn: roadmapApi.testIntegrationConnection });
  const busy = saveMutation.isPending || testMutation.isPending;
  const payload = () => ({ organizationUrl: organizationUrl.trim(), pat: pat.trim() || undefined });

  function clearFeedback() {
    if (saveNotice) setSaveNotice('');
    if (saveMutation.isError) saveMutation.reset();
    if (testMutation.isError || testMutation.isSuccess) testMutation.reset();
  }

  return (
    <section id="azure-connection" aria-labelledby="azure-connection-title" className="scroll-mt-4 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3.5 sm:basis-0">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 id="azure-connection-title" className="text-base font-semibold leading-tight text-foreground">Azure DevOps</h2>
              <StatusPill active={settings.configured} label={settings.configured ? 'Настроено' : 'Не подключено'} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {settings.configured ? settings.organizationUrl.replace(/^https?:\/\//, '') : 'Укажите адрес организации и токен доступа.'}
            </p>
          </div>
        </div>
        {settings.configured ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Настройки подключения"
            aria-expanded={editing}
            aria-controls="azure-connection-form"
            onClick={() => {
              if (expanded && openFromLink) {
                window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
                window.dispatchEvent(new Event('hashchange'));
              }
              setExpanded(!expanded);
              setShowPat(false);
            }}
          >
            Настройки <ChevronDown aria-hidden="true" className={editing ? 'size-4 rotate-180' : 'size-4'} />
          </Button>
        ) : <a href="#azure-help" className="rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Справка</a>}
      </div>

      {saveNotice ? <div className="px-4 pb-4 sm:px-5"><AdminAlert tone="success">{saveNotice}</AdminAlert></div> : null}

      <form
        ref={form}
        id="azure-connection-form"
        hidden={!editing}
        className="space-y-4 border-t border-border p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !settings.encryptionKeyConfigured) return;
          clearFeedback();
          saveMutation.mutate(payload());
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="azure-org-url">Адрес организации</Label>
            <Input
              ref={organizationField}
              id="azure-org-url"
              type="url"
              required
              readOnly={busy}
              value={organizationUrl}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => { setOrganizationDraft(event.target.value); clearFeedback(); }}
              placeholder="https://dev.azure.com/your-organization"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="azure-pat">Токен доступа (PAT)</Label>
            <div className="relative">
              <Input
                id="azure-pat"
                type={showPat ? 'text' : 'password'}
                required={!settings.patConfigured}
                readOnly={busy}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                value={pat}
                onChange={(event) => { setPat(event.target.value); clearFeedback(); }}
                placeholder={settings.patConfigured ? '••••••••' : 'Вставьте токен из Azure DevOps'}
                aria-describedby={settings.patConfigured ? 'azure-pat-help' : undefined}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPat((visible) => !visible)}
                aria-label={showPat ? 'Скрыть токен' : 'Показать токен'}
                aria-controls="azure-pat"
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {showPat ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
              </button>
            </div>
            {settings.patConfigured ? (
              <p id="azure-pat-help" className="text-xs leading-relaxed text-muted-foreground">
                Введите новый токен, если хотите заменить текущий.
              </p>
            ) : null}
          </div>
        </div>

        <details className="rounded-lg border border-border bg-muted/25 px-3.5 text-sm">
          <summary className="cursor-pointer rounded py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-ring">Какие права нужны токену</summary>
          <ul className="grid gap-1 pb-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
            <li>Project and Team: Read — проекты</li>
            <li>Graph: Read — участники организации</li>
            <li>Work Items: Read — задачи и роли</li>
            <li>Work Items: Read &amp; Write — отправка плана</li>
          </ul>
        </details>

        {settings.source === 'environment' ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Сейчас используются настройки API. Сохранённые здесь настройки получат приоритет.
          </p>
        ) : null}
        {!settings.encryptionKeyConfigured ? (
          <p className="text-sm text-muted-foreground">Чтобы сохранять токен, настройте ключ шифрования в API (ROADMAP_ENCRYPTION_KEY или JWT_SECRET).</p>
        ) : null}
        {saveMutation.isError || testMutation.isError ? <AdminAlert tone="error">{errorText(saveMutation.error ?? testMutation.error)}</AdminAlert> : null}
        {testMutation.data ? <AdminAlert tone="success">{testMutation.data.projectCount > 0 ? 'Доступ к проектам Azure DevOps подтверждён.' : 'Azure DevOps принял токен, но не вернул доступных проектов.'}</AdminAlert> : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!form.current?.reportValidity()) return;
              clearFeedback();
              testMutation.mutate(payload());
            }}
          >
            {testMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : null}
            {testMutation.isPending ? 'Проверяем…' : 'Проверить доступ'}
          </Button>
          <Button type="submit" disabled={busy || !settings.encryptionKeyConfigured}>
            {saveMutation.isPending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : null}
            {saveMutation.isPending ? 'Сохраняем…' : settings.configured ? 'Сохранить изменения' : 'Подключить Azure DevOps'}
          </Button>
        </div>
      </form>
    </section>
  );
}
