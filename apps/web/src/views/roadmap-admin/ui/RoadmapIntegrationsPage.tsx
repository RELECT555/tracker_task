'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FolderSync, ListFilter, Upload, Webhook } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { AdminCard, AdminPage, AdminPageHeader } from './AdminLayout';
import { AzureConnectionPanel } from './integrations/AzureConnectionPanel';
import { ConnectionSkeleton, ProjectsOverviewSkeleton } from './integrations/IntegrationSkeletons';
import { AzureSyncGuide } from './integrations/AzureSyncGuide';
import { FaqAccordion } from './integrations/faq';
import { FieldMappingPanel } from './integrations/FieldMappingPanel';
import { integrationColors } from './integrations/parts';
import { SyncProjectsPanel } from './integrations/SyncProjectsPanel';
import { WebhookPanel } from './integrations/WebhookPanel';
import { WriteBackSettingsPanel } from './integrations/WriteBackSettingsPanel';

const SECTIONS = [
  { id: 'azure-projects', label: 'Проекты', icon: FolderSync },
  { id: 'azure-write-back', label: 'Запись в Azure', icon: Upload },
  { id: 'azure-mapping', label: 'Поля задач', icon: ListFilter },
  { id: 'azure-webhook', label: 'Webhook', icon: Webhook },
  { id: 'azure-help', label: 'Справка', icon: BookOpen },
] as const;

export function RoadmapIntegrationsPage() {
  const settingsQuery = useQuery({
    queryKey: ['roadmap', 'integration', 'azure-devops'],
    queryFn: roadmapApi.integrationSettings,
  });
  const settings = settingsQuery.data;
  const configured = Boolean(settings?.configured);
  const [fragment, setFragment] = useState('');
  const [focusProjects, setFocusProjects] = useState(false);
  const [visitedEditors, setVisitedEditors] = useState({ writeBack: false, mapping: false });
  const section = fragment.startsWith('faq-') ? 'azure-help'
    : SECTIONS.find(({ id }) => id === fragment)?.id ?? 'azure-projects';
  const needsOverview = section === 'azure-projects' || section === 'azure-write-back' || section === 'azure-mapping';
  const overviewQuery = useQuery({
    queryKey: ['roadmap', 'write-back-overview'],
    queryFn: roadmapApi.writeBackOverview,
    enabled: configured && needsOverview,
    refetchInterval: (query) => query.state.data?.projects.some(({ counts }) => counts.pending > 0 || counts.sending > 0) ? 4000 : false,
  });
  const overview = overviewQuery.data;
  const overviewReady = Boolean(overview);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastFocusedFragment = useRef('');

  useEffect(() => {
    if (!configured || !overviewReady) return;
    if (section === 'azure-write-back' && !visitedEditors.writeBack) {
      setVisitedEditors((visited) => ({ ...visited, writeBack: true }));
    }
    if (section === 'azure-mapping' && !visitedEditors.mapping) {
      setVisitedEditors((visited) => ({ ...visited, mapping: true }));
    }
  }, [configured, overviewReady, section, visitedEditors]);

  useEffect(() => {
    const readFragment = () => {
      lastFocusedFragment.current = '';
      setFragment(window.location.hash.slice(1));
    };
    readFragment();
    window.addEventListener('hashchange', readFragment);
    return () => window.removeEventListener('hashchange', readFragment);
  }, []);

  useEffect(() => {
    if (!settings || !fragment || fragment === 'azure-connection' || lastFocusedFragment.current === fragment) return;
    const target = document.getElementById(fragment);
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      lastFocusedFragment.current = fragment;
      let focusTarget = target;
      if (target instanceof HTMLDetailsElement) {
        target.open = true;
        focusTarget = target.querySelector('summary') ?? target;
      } else if (section === 'azure-projects') {
        focusTarget = target.querySelector<HTMLElement>('h2[tabindex], h3[tabindex]') ?? target;
      }
      focusTarget.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [fragment, section, settings, overviewReady]);

  useEffect(() => {
    if (!focusProjects || !configured || section !== 'azure-projects') return;
    const heading = contentRef.current?.querySelector<HTMLElement>('h2[tabindex]');
    if (!heading) return;
    heading.focus();
    setFocusProjects(false);
  }, [configured, focusProjects, section, overviewReady]);

  const loadingOverview = needsOverview && overviewQuery.isLoading;
  const integrationQueries = [settingsQuery, ...(configured && needsOverview ? [overviewQuery] : [])];
  const mappingShowsErrors = configured && overviewReady && section === 'azure-mapping';

  return (
    <AdminPage className={integrationColors}>
      <AdminPageHeader
        title="Интеграции"
        description="Управляйте подключением Azure DevOps и обменом данными с Roadmap."
      />

      {settingsQuery.isLoading ? <ConnectionSkeleton /> : null}
      {!mappingShowsErrors && <QueryErrorNotice
        title="Не удалось загрузить данные интеграции"
        queries={integrationQueries}
      />}

      {settings ? (
        <AzureConnectionPanel
          settings={settings}
          openFromLink={fragment === 'azure-connection'}
          onFirstConnect={() => {
            if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
            setFragment('');
            setFocusProjects(true);
          }}
        />
      ) : null}

      {configured ? (
        <nav aria-label="Настройки Azure DevOps" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={section === id ? 'location' : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                event.preventDefault();
                if (fragment === id) return;
                window.history.pushState(window.history.state, '', `#${id}`);
                lastFocusedFragment.current = id;
                setFragment(id);
              }}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                section === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      {settings && (configured || section === 'azure-help') ? (
        <div id={section} ref={contentRef} tabIndex={-1} className="scroll-mt-4 space-y-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          {loadingOverview ? <ProjectsOverviewSkeleton /> : null}
          {section === 'azure-projects' && overview ? <SyncProjectsPanel overview={overview} /> : null}
          {configured && overview && (visitedEditors.writeBack || section === 'azure-write-back') ? (
            <div hidden={section !== 'azure-write-back'}><WriteBackSettingsPanel settings={settings.writeBack} overview={overview} /></div>
          ) : null}
          {configured && overview && (visitedEditors.mapping || section === 'azure-mapping') ? (
            <div hidden={section !== 'azure-mapping'}><FieldMappingPanel overview={overview} queries={mappingShowsErrors ? integrationQueries : undefined} /></div>
          ) : null}
          {section === 'azure-webhook' ? <WebhookPanel webhookConfigured={settings.webhookConfigured} /> : null}
          {section === 'azure-help' ? (
            <>
              <AdminCard title="Частые вопросы"><div className="p-4 sm:p-5"><FaqAccordion key={fragment} connected={configured} /></div></AdminCard>
              <AzureSyncGuide />
            </>
          ) : null}
        </div>
      ) : null}
    </AdminPage>
  );
}
