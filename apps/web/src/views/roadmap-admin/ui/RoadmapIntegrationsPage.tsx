'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, CircleHelp, Eye, EyeOff, KeyRound, Link2, LoaderCircle, PlugZap, Save, ShieldCheck } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export function RoadmapIntegrationsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['roadmap', 'integration', 'azure-devops'],
    queryFn: roadmapApi.integrationSettings,
  });
  const settings = settingsQuery.data;
  const [organizationUrl, setOrganizationUrl] = useState('');
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.organizationUrl) setOrganizationUrl(settings.organizationUrl);
  }, [settings?.organizationUrl]);

  const saveMutation = useMutation({
    mutationFn: roadmapApi.saveIntegrationSettings,
    onSuccess: async () => {
      setPat('');
      setNotice('Настройки сохранены. PAT хранится в зашифрованном виде.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'connection'] }),
      ]);
    },
  });

  const testMutation = useMutation({
    mutationFn: roadmapApi.testIntegrationConnection,
    onSuccess: (result) => setNotice(`Подключение работает. Проектов доступно: ${result.projectCount}.`),
  });

  const error = settingsQuery.error ?? saveMutation.error ?? testMutation.error;
  const busy = saveMutation.isPending || testMutation.isPending;

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Администрирование Roadmap</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Интеграции</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Подключайте источники проектов, work items и участников команды. Секреты доступны только API и не возвращаются в браузер.
          </p>
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error instanceof Error ? error.message : 'Не удалось выполнить запрос'}</span>
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><GitBranchIcon /></div>
              <div>
                <h2 className="font-semibold text-foreground">Azure DevOps</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Проекты, эпики, фичи и каталог пользователей</p>
              </div>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${settings?.configured ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${settings?.configured ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
              {settingsQuery.isLoading ? 'Проверяем' : settings?.configured ? 'Подключено' : 'Не подключено'}
            </span>
          </div>

          <form
            className="space-y-5 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice(null);
              saveMutation.mutate({ organizationUrl: organizationUrl.trim(), pat: pat || undefined });
            }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="azure-org-url">URL организации</Label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="azure-org-url"
                    type="url"
                    required
                    value={organizationUrl}
                    onChange={(event) => { setOrganizationUrl(event.target.value); setNotice(null); }}
                    placeholder="https://dev.azure.com/your-organization"
                    className="h-10 pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Например, https://dev.azure.com/contoso</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="azure-pat">Personal Access Token</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="azure-pat"
                    type={showPat ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={pat}
                    onChange={(event) => { setPat(event.target.value); setNotice(null); }}
                    placeholder={settings?.patConfigured ? 'Сохранён. Оставьте пустым, чтобы не менять' : 'Вставьте PAT с правами чтения'}
                    className="h-10 pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPat((visible) => !visible)}
                    aria-label={showPat ? 'Скрыть PAT' : 'Показать PAT'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Нужны права чтения проектов, work items и Graph.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              PAT шифруется на API перед записью в базу. Он не отображается после сохранения и не передаётся напрямую в браузер.
            </div>

            {settings?.source === 'environment' ? (
              <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
                Сейчас используется подключение из переменных окружения API. Сохранённые здесь настройки будут иметь приоритет.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">
                {settings?.organizationUrl ? `Организация: ${settings.organizationUrl}` : 'Настройки ещё не сохранены'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !organizationUrl.trim() || (!pat && !settings?.patConfigured)}
                  onClick={() => {
                    setNotice(null);
                    testMutation.mutate({ organizationUrl: organizationUrl.trim(), pat: pat || undefined });
                  }}
                  className="gap-2"
                >
                  {testMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                  Проверить подключение
                </Button>
                <Button type="submit" disabled={busy || !organizationUrl.trim()} className="gap-2">
                  {saveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Сохранить
                </Button>
              </div>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Что доступно после подключения</h2>
          <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <p>Список доступных проектов</p>
            <p>Импорт эпиков и фич с иерархией</p>
            <p>Участники организации для ролевого плана</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function GitBranchIcon() {
  return <PlugZap className="h-5 w-5" strokeWidth={1.7} />;
}
