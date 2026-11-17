'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { AdminPage, AdminPageHeader } from './AdminLayout';
import { AzureConnectionPanel } from './integrations/AzureConnectionPanel';
import { ConnectionSkeleton, ProjectsOverviewSkeleton } from './integrations/IntegrationSkeletons';
import { AzureSyncGuide } from './integrations/AzureSyncGuide';
import { FaqSection } from './integrations/faq';
import { integrationColors } from './integrations/parts';
import { SyncProjectsPanel } from './integrations/SyncProjectsPanel';
import { WebhookPanel } from './integrations/WebhookPanel';
import { AzureDataPanel } from './integrations/AzureDataPanel';
import { SendingSettingsPanel } from './integrations/SendingSettingsPanel';
import { TaskTemplatePanel } from './integrations/TaskTemplatePanel';

const SECTIONS = [
  { id: 'azure-projects', label: 'Проекты' },
  { id: 'azure-write-back', label: 'Отправка' },
  { id: 'azure-templates', label: 'Шаблоны задач' },
  { id: 'azure-data', label: 'Данные из Azure' },
  { id: 'azure-webhook', label: 'Webhook' },
  { id: 'azure-help', label: 'Справка' },
] as const;

/** Section ids from before the tabs were reorganised keep working in saved links. */
const LEGACY_SECTIONS: Record<string, (typeof SECTIONS)[number]['id']> = { 'azure-mapping': 'azure-templates' };

type EditorSection = 'azure-write-back' | 'azure-templates' | 'azure-data';
const EDITOR_SECTIONS: readonly string[] = ['azure-write-back', 'azure-templates', 'azure-data'] satisfies EditorSection[];

export function RoadmapIntegrationsPage() {
  const settingsQuery = useQuery({
    queryKey: ['roadmap', 'integration', 'azure-devops'],
    queryFn: roadmapApi.integrationSettings,
  });
  const settings = settingsQuery.data;
  const configured = Boolean(settings?.configured);
  const [fragment, setFragment] = useState('');
  const [focusProjects, setFocusProjects] = useState(false);
  const [visitedEditors, setVisitedEditors] = useState<Record<EditorSection, boolean>>({ 'azure-write-back': false, 'azure-templates': false, 'azure-data': false });
  const section = fragment.startsWith('faq-') ? 'azure-help'
    : SECTIONS.find(({ id }) => id === fragment)?.id ?? LEGACY_SECTIONS[fragment] ?? 'azure-projects';
  const needsOverview = section === 'azure-projects' || EDITOR_SECTIONS.includes(section);
  const overviewQuery = useQuery({
    queryKey: ['roadmap', 'write-back-overview'],
    queryFn: roadmapApi.writeBackOverview,
    enabled: configured && needsOverview,
    refetchInterval: (query) => query.state.data?.projects.some(({ counts }) => counts.pending > 0 || counts.sending > 0) ? 4000 : false,
  });
  const overview = overviewQuery.data;
  const overviewReady = Boolean(overview);
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const lastFocusedFragment = useRef('');

  // On narrow screens the tab strip scrolls horizontally; keep the active tab visible without moving the page.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current]');
    if (!nav || !active) return;
    if (active.offsetLeft < nav.scrollLeft) nav.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = active.offsetLeft + active.offsetWidth - nav.clientWidth;
  }, [section, configured]);

  useEffect(() => {
    if (!configured || !overviewReady) return;
    if (EDITOR_SECTIONS.includes(section) && !visitedEditors[section as EditorSection]) {
      setVisitedEditors((visited) => ({ ...visited, [section]: true }));
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

  return (
    <AdminPage className={integrationColors}>
      <AdminPageHeader
        title="Интеграции"
        description="Подключение Azure DevOps и синхронизация с Roadmap."
      />

      {settingsQuery.isLoading ? <ConnectionSkeleton /> : null}
      <QueryErrorNotice
        title="Не удалось загрузить данные интеграции"
        queries={integrationQueries}
      />

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
        <nav ref={navRef} aria-label="Настройки Azure DevOps" className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shadow-[inset_0_-1px_0_hsl(var(--border))]">
          {SECTIONS.map(({ id, label }) => (
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
                'inline-flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                section === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      {settings && (configured || section === 'azure-help') ? (
        <div id={section} ref={contentRef} tabIndex={-1} className="scroll-mt-4 space-y-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          {loadingOverview ? <ProjectsOverviewSkeleton /> : null}
          {section === 'azure-projects' && overview ? <SyncProjectsPanel overview={overview} /> : null}
          {configured && overview && (visitedEditors['azure-write-back'] || section === 'azure-write-back') ? (
            <div hidden={section !== 'azure-write-back'}><SendingSettingsPanel overview={overview} /></div>
          ) : null}
          {configured && overview && (visitedEditors['azure-templates'] || section === 'azure-templates') ? (
            <div hidden={section !== 'azure-templates'}><TaskTemplatePanel overview={overview} /></div>
          ) : null}
          {configured && overview && (visitedEditors['azure-data'] || section === 'azure-data') ? (
            <div hidden={section !== 'azure-data'}><AzureDataPanel overview={overview} /></div>
          ) : null}
          {section === 'azure-webhook' ? <WebhookPanel webhookConfigured={settings.webhookConfigured} /> : null}
          {section === 'azure-help' ? (
            <>
              <FaqSection key={fragment} connected={configured} openFromLink={fragment.startsWith('faq-')} />
              <AzureSyncGuide />
            </>
          ) : null}
        </div>
      ) : null}
    </AdminPage>
  );
}
