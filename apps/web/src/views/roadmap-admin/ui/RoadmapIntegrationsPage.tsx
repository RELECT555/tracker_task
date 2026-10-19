'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, EyeOff, FolderSync, KeyRound, Link2, LoaderCircle, PlugZap, Save, ShieldCheck, SlidersHorizontal, Webhook } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { AdminAlert, AdminCard, AdminPage, AdminPageHeader, StatusPill } from './AdminLayout';
import { AzureSyncGuide } from './integrations/AzureSyncGuide';
import { Chip, MODE_LABEL } from './integrations/parts';
import { SyncProjectsPanel } from './integrations/SyncProjectsPanel';
import { WebhookPanel } from './integrations/WebhookPanel';
import { WriteBackSettingsPanel } from './integrations/WriteBackSettingsPanel';

type Tab = 'connection' | 'guide' | 'write-back' | 'projects' | 'webhook';
const TAB_STORAGE_KEY = 'roadmap-integrations-tab';

const TABS: { id: Tab; label: string; icon: React.ReactNode; needsConnection?: boolean }[] = [
  { id: 'connection', label: 'Подключение', icon: <PlugZap className="h-4 w-4" /> },
  { id: 'guide', label: 'Как это работает', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'write-back', label: 'Настройки записи', icon: <SlidersHorizontal className="h-4 w-4" />, needsConnection: true },
  { id: 'projects', label: 'Проекты и статус', icon: <FolderSync className="h-4 w-4" />, needsConnection: true },
  { id: 'webhook', label: 'Webhook', icon: <Webhook className="h-4 w-4" />, needsConnection: true },
];

export function RoadmapIntegrationsPage() {
  const settingsQuery = useQuery({
    queryKey: ['roadmap', 'integration', 'azure-devops'],
    queryFn: roadmapApi.integrationSettings,
  });
  const settings = settingsQuery.data;
  const configured = Boolean(settings?.configured);
  const overviewQuery = useQuery({
    queryKey: ['roadmap', 'write-back-overview'],
    queryFn: roadmapApi.writeBackOverview,
    enabled: configured,
    // Keep counters live while assignments are being sent.
    refetchInterval: (query) => query.state.data?.projects.some((project) => project.counts.pending > 0) ? 4000 : false,
  });
  const overview = overviewQuery.data;
  const [tab, setTab] = useState<Tab>('connection');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as Tab | null;
      if (saved && TABS.some((item) => item.id === saved)) setTab(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const selectTab = (next: Tab) => {
    setTab(next);
    try { window.localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* storage unavailable */ }
  };
  const activeTab = !configured && TABS.find((item) => item.id === tab)?.needsConnection ? 'connection' : tab;

  const errorCount = overview?.projects.reduce((sum, project) => sum + project.counts.error, 0) ?? 0;
  const waitingCount = overview?.projects.reduce((sum, project) => sum + project.counts.pending + project.counts.notSent, 0) ?? 0;

  return (
    <AdminPage className="max-w-none">
      <AdminPageHeader
        title="Интеграции"
        description="Azure DevOps: импорт проектов и людей, запись плана в задачи и получение факта. Секреты хранятся только на API и не возвращаются в браузер."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone={configured ? 'ok' : 'muted'}>{settingsQuery.isLoading ? 'Проверяем подключение' : configured ? 'Azure DevOps подключён' : 'Не подключено'}</Chip>
        {settings ? <Chip tone={settings.writeBack.mode === 'off' ? 'muted' : 'info'}>Запись плана: {MODE_LABEL[settings.writeBack.mode].toLowerCase()}</Chip> : null}
        {settings ? <Chip tone={settings.webhookConfigured ? 'ok' : 'muted'}>Webhook: {settings.webhookConfigured ? 'настроен' : 'не настроен'}</Chip> : null}
        {waitingCount ? <Chip tone="warn">Ждут отправки: {waitingCount}</Chip> : null}
        {errorCount ? <button type="button" onClick={() => selectTab('projects')} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"><Chip tone="error">Ошибок: {errorCount} →</Chip></button> : null}
      </div>

      <div role="tablist" aria-label="Разделы интеграции" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => {
          const disabled = Boolean(item.needsConnection && !configured);
          return <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            disabled={disabled}
            title={disabled ? 'Сначала подключите Azure DevOps' : undefined}
            onClick={() => selectTab(item.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${activeTab === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {item.icon}{item.label}
          </button>;
        })}
      </div>

      <div role="tabpanel" className="space-y-5">
        {overviewQuery.error && activeTab !== 'connection' && activeTab !== 'guide' ? <AdminAlert tone="error">{overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Не удалось загрузить статус'}</AdminAlert> : null}
        {activeTab === 'connection' ? <ConnectionCard /> : null}
        {activeTab === 'guide' ? <AzureSyncGuide /> : null}
        {activeTab === 'write-back' && settings ? <WriteBackSettingsPanel settings={settings.writeBack} overview={overview} /> : null}
        {activeTab === 'projects' ? <SyncProjectsPanel overview={overview} loading={overviewQuery.isLoading} /> : null}
        {activeTab === 'webhook' && settings ? <WebhookPanel webhookConfigured={settings.webhookConfigured} /> : null}
      </div>
    </AdminPage>
  );
}

function ConnectionCard() {
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
    <>
      {error ? <AdminAlert tone="error">{error instanceof Error ? error.message : 'Не удалось выполнить запрос'}</AdminAlert> : null}
      {notice ? <AdminAlert tone="success">{notice}</AdminAlert> : null}

      <AdminCard
        title="Azure DevOps"
        description="Проекты, эпики, фичи, каталог пользователей и запись плана"
        icon={<PlugZap className="h-[18px] w-[18px]" strokeWidth={1.7} />}
        badge={<StatusPill active={Boolean(settings?.configured)} label={settingsQuery.isLoading ? 'Проверяем' : settings?.configured ? 'Подключено' : 'Не подключено'} />}
      >
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
                className="pl-9"
              />
            </div>
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
                placeholder={settings?.patConfigured ? '•••••••• сохранён — оставьте пустым, чтобы не менять' : 'Вставьте PAT'}
                className="pl-9 pr-10"
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
          </div>
          </div>

          <div className="rounded-lg border border-border px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Права PAT · User settings → Personal access tokens → Custom defined</p>
            <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
              <li><span className="text-foreground">Project and Team: Read</span> — список проектов</li>
              <li><span className="text-foreground">Graph: Read</span> — участники организации</li>
              <li><span className="text-foreground">Work Items: Read</span> — импорт фич и факта</li>
              <li><span className="text-foreground">Work Items: Read &amp; Write</span> — для записи плана</li>
            </ul>
            <p className="mt-1.5">Право записи проверяется без создания задач: «Проекты и статус» → «Проверить готовность».</p>
          </div>

          {settings?.source === 'environment' ? (
            <p className="rounded-lg border border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Сейчас используется подключение из переменных окружения API. Сохранённые здесь настройки будут иметь приоритет.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" />PAT шифруется перед записью в базу</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || !organizationUrl.trim() || (!pat && !settings?.patConfigured)}
                onClick={() => {
                  setNotice(null);
                  testMutation.mutate({ organizationUrl: organizationUrl.trim(), pat: pat || undefined });
                }}
                className="h-9"
              >
                {testMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Проверить
              </Button>
              <Button type="submit" disabled={busy || !organizationUrl.trim()} className="h-9">
                {saveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Сохранить
              </Button>
            </div>
          </div>
        </form>
      </AdminCard>

      {!settings?.configured ? (
        <section className="rounded-xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
          После подключения откроются вкладки «Настройки записи», «Проекты и статус» и «Webhook». Начните с вкладки «Как это работает».
        </section>
      ) : null}
    </>
  );
}
