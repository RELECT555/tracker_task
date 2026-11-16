'use client';

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ChevronRight, ExternalLink, FileText, History, Lock, MessageSquare, Pencil, Plus, RefreshCw, X, type LucideIcon } from 'lucide-react';
import type { RoadmapAllocation, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { planChangesApi, planChangesQueryKey, type PlanChangePage } from '@/entities/roadmap/api/planChangesApi';
import { groupByBatch } from '@/entities/roadmap/lib/plan-change-text';
import { workItemCardApi, workItemCardQueryKey, type WorkItemCard, type WorkItemCardPerson, type WorkItemCardUpdate } from '@/entities/roadmap/api/workItemCardApi';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { PlanChangeEntry } from '@/entities/roadmap/ui/PlanChangeEntry';
import { SafeAzureHtml } from '@/entities/roadmap/ui/SafeAzureHtml';
import { WorkItemStateBadge } from '@/entities/roadmap/ui/WorkItemStateBadge';
import { ApiError } from '@/shared/api/client';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/error-notice';
import { SearchableSelect, type SearchableSelectOption } from '@/shared/ui/searchable-select';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';
import { AllocationAzurePanel } from './AllocationAzurePanel';

type Tab = 'description' | 'plan' | 'children' | 'discussion' | 'history';

const UNASSIGNED = '__unassigned__';
/** The item's history loads one page of plan changes (the API's maximum). */
const PLAN_CHANGES_LIMIT = 200;
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** Ghost look for selects inside the property list: no box until hovered. */
const inlineSelect = 'min-h-8 -ml-2 w-auto max-w-full border-transparent bg-transparent px-2 py-1 shadow-none hover:bg-muted/60';

function formatDate(value: string | null, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : (withTime ? dateTimeFormat : dateFormat).format(date).replace(/\s*г\.$/, '');
}

function hours(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? `${hoursFormat.format(number)} ч` : null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('ru-RU');
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary', className)}>{initials(name)}</span>;
}

function PersonName({ person }: { person: WorkItemCardPerson | null }) {
  if (!person) return <span className="text-muted-foreground">Не назначен</span>;
  return <span className="inline-flex min-w-0 items-center gap-2"><Avatar name={person.name} /><span className="truncate">{person.name}</span></span>;
}

const syncTone: Record<string, { label: string; dot: string; text?: string }> = {
  synced: { label: 'В Azure', dot: 'bg-emerald-500' },
  pending: { label: 'Ждёт отправки', dot: 'bg-amber-500' },
  sending: { label: 'Отправляется', dot: 'bg-sky-500 animate-pulse motion-reduce:animate-none' },
  error: { label: 'Ошибка отправки', dot: 'bg-destructive', text: 'text-destructive' },
  conflict: { label: 'Конфликт', dot: 'bg-destructive', text: 'text-destructive' },
  skipped: { label: 'Не отправляется', dot: 'bg-muted-foreground/40' },
};

function SyncStatus({ allocation }: { allocation: RoadmapAllocation }) {
  const tone = syncTone[allocation.azureSyncStatus ?? ''] ?? { label: 'Не отправлено', dot: 'bg-muted-foreground/40' };
  return <span className={cn('inline-flex items-center gap-1.5', tone.text)}><span aria-hidden="true" className={cn('size-1.5 rounded-full', tone.dot)} />{tone.label}</span>;
}

/** One quiet empty state for every tab, so an empty panel reads as intentional rather than broken. */
function EmptyState({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
    <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" /></span>
    <p className="text-sm text-muted-foreground">{text}</p>
    {action}
  </div>;
}

function Property({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{label}</dt>
    <dd className="mt-1 flex min-h-8 min-w-0 items-center text-sm text-foreground [overflow-wrap:anywhere]">{children}</dd>
  </div>;
}

/** Azure paths read as "Project\Team\Sprint": lead with the leaf, keep the rest as quiet context. */
function AzurePath({ value }: { value: string }) {
  const parts = value.split('\\').filter(Boolean);
  const leaf = parts.pop() ?? value;
  return <span title={value} className="min-w-0">
    <span className="font-medium">{leaf}</span>
    {parts.length ? <span className="block truncate text-xs text-muted-foreground">{parts.join(' / ')}</span> : null}
  </span>;
}

const priorities: Record<number, { label: string; dot: string }> = {
  1: { label: 'критический', dot: 'bg-rose-500' },
  2: { label: 'высокий', dot: 'bg-amber-500' },
  3: { label: 'средний', dot: 'bg-sky-500' },
  4: { label: 'низкий', dot: 'bg-muted-foreground/40' },
};

function Priority({ value }: { value: number }) {
  const tone = priorities[value];
  return <span className="inline-flex items-center gap-2 tabular-nums">
    <span aria-hidden="true" className={cn('size-2 rounded-full', tone?.dot ?? 'bg-muted-foreground/40')} />
    <span>{value}{tone ? <span className="text-muted-foreground"> · {tone.label}</span> : null}</span>
  </span>;
}

export interface WorkItemCardSheetProps {
  projectId: string;
  /** Azure DevOps id of the work item to show; null closes the sheet. */
  externalId: string | null;
  onNavigate: (externalId: string | null) => void;
  /** Plan rows from the loaded Roadmap plan, matched by Azure id. */
  planItems: RoadmapWorkItem[];
  onRetryAllocation?: (allocationId: string) => void;
  retrying?: boolean;
  /** The viewer plans this project: may resolve conflicts and log time for others. */
  canEditPlan?: boolean;
  /** Plan write-back to Azure is on, so time logging and conflict actions are offered. */
  writeEnabled?: boolean;
}

export function WorkItemCardSheet({ projectId, externalId, onNavigate, planItems, onRetryAllocation, retrying = false, canEditPlan = false, writeEnabled = false }: WorkItemCardSheetProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [trail, setTrail] = useState<string[]>([]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (externalId && !element.open) {
      element.showModal();
      setPortal(element);
    }
    if (!externalId && element.open) element.close();
  }, [externalId]);

  useEffect(() => {
    if (!externalId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [externalId]);

  const open = (next: string) => {
    if (externalId) setTrail((current) => [...current, externalId]);
    onNavigate(next);
  };
  const back = () => {
    const previous = trail.at(-1);
    setTrail((current) => current.slice(0, -1));
    if (previous) onNavigate(previous);
  };
  const close = () => { setTrail([]); onNavigate(null); };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      className="roadmap-sheet fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[44rem] overflow-hidden border-l border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/25"
      onClose={() => { if (externalId) close(); }}
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}
    >
      {externalId ? (
        <CardContent
          key={externalId}
          titleId={`${id}-title`}
          projectId={projectId}
          externalId={externalId}
          planItem={planItems.find((item) => item.externalId === externalId)}
          taskAllocations={planItems.flatMap((item) => item.allocations).filter((allocation) => allocation.azureTaskId === externalId)}
          portal={portal}
          canGoBack={trail.length > 0}
          onBack={back}
          onClose={close}
          onOpen={open}
          onRetryAllocation={onRetryAllocation}
          retrying={retrying}
          canEditPlan={canEditPlan}
          writeEnabled={writeEnabled}
        />
      ) : null}
    </dialog>
  );
}

function CardContent({ titleId, projectId, externalId, planItem, taskAllocations, portal, canGoBack, onBack, onClose, onOpen, onRetryAllocation, retrying, canEditPlan, writeEnabled }: {
  titleId: string;
  projectId: string;
  externalId: string;
  planItem?: RoadmapWorkItem;
  /** Allocations whose Task this card shows (a Task created by Roadmap). */
  taskAllocations: RoadmapAllocation[];
  canEditPlan: boolean;
  writeEnabled: boolean;
  portal: HTMLElement | null;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onOpen: (externalId: string) => void;
  onRetryAllocation?: (allocationId: string) => void;
  retrying: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = workItemCardQueryKey(projectId, externalId);
  const card = useQuery({
    queryKey,
    queryFn: ({ signal }) => workItemCardApi.get(projectId, externalId, signal),
    staleTime: 15_000,
    retry: (count, error) => !(error instanceof ApiError && (error.status ?? 500) < 500) && count < 2,
  });
  // Allocations live on Features and Epics, so only they have plan changes. Asked separately from the
  // Azure card, which can fail on its own: each side of the history shows without the other.
  const cardType = card.data?.type ?? planItem?.type;
  const hasPlanChanges = cardType === 'Feature' || cardType === 'Epic';
  const planChanges = useQuery({
    queryKey: planChangesQueryKey(projectId, externalId),
    queryFn: ({ signal }) => planChangesApi.list(projectId, { workItemExternalId: externalId, limit: PLAN_CHANGES_LIMIT }, signal),
    enabled: hasPlanChanges,
    staleTime: 15_000,
    retry: (count, error) => !(error instanceof ApiError && (error.status ?? 500) < 500) && count < 2,
  });
  const allocations = planItem?.allocations.length ? planItem.allocations : taskAllocations;
  // Picked once the card loads: open on the first tab that has something to show.
  const [chosenTab, setTab] = useState<Tab | null>(allocations.length ? 'plan' : null);

  const update = useMutation({
    mutationFn: (input: Omit<WorkItemCardUpdate, 'rev'>) => workItemCardApi.update(projectId, externalId, { rev: card.data!.rev, ...input }),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', projectId] });
    },
  });
  const conflict = update.error instanceof ApiError && update.error.status === 409;
  const refresh = () => { update.reset(); void card.refetch(); };

  const header = (item?: WorkItemCard) => <CardHeader
    canGoBack={canGoBack}
    onBack={onBack}
    onClose={onClose}
    crumbs={<>
      {item?.parent ? <>
        <button type="button" onClick={() => onOpen(item.parent!.id)} title={item.parent.title} className="inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <AzureWorkItemIcon type={item.parent.type} className="size-3.5" />
          <span className="truncate">{item.parent.title}</span>
        </button>
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 opacity-50" />
      </> : null}
      <span className="inline-flex shrink-0 items-center gap-1.5 px-1">
        {item ? <AzureWorkItemIcon type={item.type} className="size-3.5" /> : null}
        <span className="tabular-nums">{item ? `${item.type} ${item.id}` : `#${externalId}`}</span>
      </span>
    </>}
    actions={item ? <>
      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Обновить из Azure DevOps" title="Обновить из Azure DevOps" disabled={card.isFetching} onClick={refresh}>
        <RefreshCw aria-hidden="true" className={cn('size-4', card.isFetching && 'animate-spin motion-reduce:animate-none')} />
      </Button>
      {item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label="Открыть в Azure DevOps" title="Открыть в Azure DevOps" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ExternalLink aria-hidden="true" className="size-4" /></a> : null}
    </> : null}
  />;

  if (card.isPending) {
    return <div className="flex h-full flex-col">
      {header()}
      <SkeletonStatus label="Загружаем карточку из Azure DevOps" className="space-y-4 px-6 py-6">
        <Skeleton className="h-7 w-3/4 rounded" />
        <div className="space-y-2.5 pt-2">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-5 w-1/2 rounded bg-muted/70 dark:bg-foreground/[0.07]" />)}</div>
        <Skeleton className="h-28 rounded bg-muted/50 dark:bg-foreground/5" />
      </SkeletonStatus>
    </div>;
  }
  if (card.isError) {
    return <div className="flex h-full flex-col">
      {header()}
      <div className="px-6 py-4">
        <ErrorNotice title="Не удалось открыть элемент из Azure DevOps" errors={[card.error]} onRetry={() => card.refetch()} retrying={card.isFetching} />
        {planItem?.url ? <a href={planItem.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Открыть в Azure DevOps<ExternalLink aria-hidden="true" className="size-3.5" /></a> : null}
        {hasPlanChanges && planChanges.data?.items.length ? <section aria-label="Изменения плана" className="mt-6">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Изменения плана</h2>
          <HistoryTab item={null} planChanges={planChanges} onOpenTask={onOpen} />
        </section> : null}
      </div>
    </div>;
  }

  const item = card.data;
  const { original, remaining, completed } = item.estimates;
  const hasHours = original !== null || remaining !== null || completed !== null;
  const changed = formatDate(item.changedAt);
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'description', label: 'Описание' },
    ...(allocations.length ? [{ id: 'plan' as const, label: 'План', count: allocations.length }] : []),
    ...(item.children.length ? [{ id: 'children' as const, label: 'Дочерние', count: item.children.length }] : []),
    { id: 'discussion', label: 'Обсуждение', count: item.comments.length },
    { id: 'history', label: 'История' },
  ];
  const hasDescription = Boolean(item.descriptionHtml || item.acceptanceCriteriaHtml);
  const tab: Tab = chosenTab ?? (hasDescription || item.canEdit ? 'description'
    : item.children.length ? 'children'
      : item.comments.length ? 'discussion'
        : 'description');
  const tabId = (entry: Tab) => `${titleId}-tab-${entry}`;
  const onTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((entry) => entry.id === tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1
            : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(tabId(tabs[next].id))?.focus();
  };

  return <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
    {header(item)}

    <div className="min-h-0 flex-1 roadmap-scrollbar overflow-y-auto">
      <section className="px-6 pt-5 pb-6">
        <EditableTitle id={titleId} value={item.title} editable={item.canEdit} saving={update.isPending} onSave={(title) => update.mutate({ title })} />
        {changed ? <p className="mt-1.5 text-xs text-muted-foreground">Изменено {changed}{item.changedBy ? ` · ${item.changedBy.name}` : ''}</p> : null}
        {!item.canEdit && item.readOnlyReason ? <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span><span className="font-medium text-foreground/80">Только просмотр.</span> {item.readOnlyReason}</span>
        </p> : null}

        {update.error ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
          <span className="flex min-w-0 items-start gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{update.error.message}</span>
          {conflict ? <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={refresh}>Обновить карточку</Button> : null}
        </div> : null}

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Property label="Состояние">
            {item.canEdit && item.states.length ? (
              <SearchableSelect
                ariaLabel="Состояние"
                value={item.state ?? ''}
                searchable={item.states.length > 8}
                disabled={update.isPending}
                portalContainer={portal}
                options={item.states.map((state) => ({ value: state.name, label: state.name, color: state.color ?? undefined }))}
                onChange={(state) => { if (state !== item.state) update.mutate({ state }); }}
                className={inlineSelect}
              />
            ) : <span className="inline-flex items-center gap-2"><WorkItemStateBadge state={item.state} />{item.reason && item.reason !== item.state ? <span className="text-xs text-muted-foreground">{item.reason}</span> : null}</span>}
          </Property>
          <Property label="Исполнитель">
            {item.canEdit ? (
              <SearchableSelect
                ariaLabel="Исполнитель"
                value={item.assignedTo?.email?.toLowerCase() ?? UNASSIGNED}
                disabled={update.isPending}
                portalContainer={portal}
                options={assigneeOptions(item)}
                onChange={(value) => update.mutate({ assignedTo: value === UNASSIGNED ? null : value })}
                className={inlineSelect}
              />
            ) : <PersonName person={item.assignedTo} />}
          </Property>
          {item.iterationPath ? <Property label="Итерация"><AzurePath value={item.iterationPath} /></Property> : null}
          {item.areaPath ? <Property label="Область"><AzurePath value={item.areaPath} /></Property> : null}
          {item.priority !== null ? <Property label="Приоритет"><Priority value={item.priority} /></Property> : null}
          {hasHours ? <Property label="Часы">
            <span className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              {original !== null ? <span><span className="text-muted-foreground">оценка </span>{hours(original)}</span> : null}
              {remaining !== null ? <span><span className="text-muted-foreground">осталось </span>{hours(remaining)}</span> : null}
              {completed !== null ? <span><span className="text-muted-foreground">факт </span>{hours(completed)}</span> : null}
            </span>
          </Property> : null}
          {item.tags.length || item.canEdit ? <Property label="Теги" wide>
            <EditableTags value={item.tags} editable={item.canEdit} saving={update.isPending} onSave={(tags) => update.mutate({ tags })} />
          </Property> : null}
        </dl>
      </section>

      <div role="tablist" aria-label="Разделы карточки" onKeyDown={onTabKey} className="sticky top-0 z-10 flex gap-5 overflow-x-auto border-y border-border bg-card px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((entry) => <button
          key={entry.id}
          id={tabId(entry.id)}
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          aria-controls={`${titleId}-panel`}
          tabIndex={tab === entry.id ? 0 : -1}
          onClick={() => setTab(entry.id)}
          className={cn('-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', tab === entry.id ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          {entry.label}{entry.count ? <span className="text-xs tabular-nums text-muted-foreground">{entry.count}</span> : null}
        </button>)}
      </div>

      <div role="tabpanel" id={`${titleId}-panel`} aria-labelledby={tabId(tab)} className="px-6 py-5">
        {tab === 'description' ? <DescriptionTab item={item} saving={update.isPending} onSave={(description) => update.mutateAsync({ description })} /> : null}
        {tab === 'plan' ? <PlanTab allocations={allocations} currentTaskId={externalId} canEditPlan={canEditPlan} writeEnabled={writeEnabled} onOpen={onOpen} onRetry={onRetryAllocation} retrying={retrying} /> : null}
        {tab === 'children' ? <ChildrenTab item={item} onOpen={onOpen} /> : null}
        {tab === 'discussion' ? <DiscussionTab item={item} projectId={projectId} /> : null}
        {tab === 'history' ? <HistoryTab item={item} planChanges={hasPlanChanges ? planChanges : undefined} onOpenTask={onOpen} /> : null}
      </div>
    </div>
  </div>;
}

function assigneeOptions(item: WorkItemCard) {
  const options: SearchableSelectOption[] = [{ value: UNASSIGNED, label: 'Не назначен' }];
  const seen = new Set<string>();
  for (const person of [...(item.assignedTo?.email ? [item.assignedTo] : []), ...item.assignees]) {
    const key = person.email!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ value: key, label: person.name, description: person.email, triggerDescription: null, leading: <span className="text-[10px] font-semibold">{initials(person.name)}</span> });
  }
  return options;
}

function CardHeader({ crumbs, canGoBack, onBack, onClose, actions }: { crumbs: ReactNode; canGoBack: boolean; onBack: () => void; onClose: () => void; actions?: ReactNode }) {
  return <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4">
    <nav aria-label="Путь к элементу" className="flex min-w-0 items-center gap-0.5 text-xs text-muted-foreground">
      {canGoBack ? <Button type="button" variant="ghost" size="icon" className="mr-1 size-8 shrink-0 text-muted-foreground" aria-label="Назад" onClick={onBack}><ArrowLeft aria-hidden="true" className="size-4" /></Button> : null}
      {crumbs}
    </nav>
    <div className="flex shrink-0 items-center gap-0.5">
      {actions}
      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" aria-label="Закрыть карточку" onClick={onClose}><X aria-hidden="true" className="size-4" /></Button>
    </div>
  </header>;
}

function EditableTitle({ id, value, editable, saving, onSave }: { id: string; value: string; editable: boolean; saving: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    const heading = <h2 id={id} className="text-balance text-xl font-semibold leading-snug tracking-tight">{value}</h2>;
    if (!editable) return heading;
    return <div className="group/title relative -mx-2 rounded-md px-2 py-0.5 hover:bg-muted/50">
      {heading}
      <button type="button" aria-label="Изменить название" onClick={() => setDraft(value)} className="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-ring" />
      <Pencil aria-hidden="true" className="pointer-events-none absolute top-2 right-2 size-3.5 text-muted-foreground opacity-0 group-hover/title:opacity-100" />
    </div>;
  }
  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== value) onSave(next);
  };
  return <div>
    <h2 id={id} className="sr-only">{value}</h2>
    <textarea
      autoFocus
      aria-label="Название"
      value={draft}
      maxLength={255}
      rows={2}
      disabled={saving}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(null); }
      }}
      className="-mx-2 w-[calc(100%+1rem)] resize-none rounded-md border border-input bg-card px-2 py-0.5 text-xl font-semibold leading-snug tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
    />
    <p className="mt-1 text-xs text-muted-foreground">Enter — сохранить, Esc — отменить</p>
  </div>;
}

function EditableTags({ value, editable, saving, onSave }: { value: string[]; editable: boolean; saving: boolean; onSave: (value: string[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return <div className="flex flex-wrap items-center gap-1.5">
      {value.map((tag) => <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{tag}</span>)}
      {editable ? <button type="button" onClick={() => setDraft(value.join(', '))} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{value.length ? <Pencil aria-hidden="true" className="size-3" /> : <Plus aria-hidden="true" className="size-3" />}{value.length ? 'Изменить' : 'Добавить'}</button> : null}
    </div>;
  }
  const commit = () => {
    const next = draft.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean);
    setDraft(null);
    if (next.join('\n') !== value.join('\n')) onSave(next);
  };
  return <input
    autoFocus
    aria-label="Теги через запятую"
    value={draft}
    disabled={saving}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(null); }
    }}
    placeholder="Тег, ещё тег"
    className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
  />;
}

function DescriptionTab({ item, saving, onSave }: { item: WorkItemCard; saving: boolean; onSave: (description: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void onSave(draft).then(() => setDraft(null), () => undefined); }}>
      <textarea autoFocus aria-label="Описание" value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>Отмена</Button>
        <span className="ml-auto text-xs text-muted-foreground">Пустая строка — новый абзац</span>
      </div>
    </form>;
  }
  const editable = item.canEdit && item.descriptionEditable;
  return <div className="space-y-6">
    <div className="group/description relative">
      {item.descriptionHtml ? <SafeAzureHtml html={item.descriptionHtml} title="Описание из Azure DevOps" />
        : <EmptyState icon={FileText} text="Описания нет" action={editable ? <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setDraft('')}><Pencil aria-hidden="true" className="size-3.5" />Добавить описание</Button> : null} />}
      {editable && item.descriptionHtml ? <Button type="button" size="sm" variant="ghost" className="mt-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setDraft(item.descriptionText)}><Pencil aria-hidden="true" className="size-3.5" />Изменить</Button> : null}
      {item.canEdit && !item.descriptionEditable ? <p className="mt-3 text-xs text-muted-foreground">Описание с форматированием меняется в Azure DevOps, чтобы не потерять разметку.</p> : null}
    </div>
    {item.acceptanceCriteriaHtml ? <section>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Критерии приёмки</h3>
      <SafeAzureHtml html={item.acceptanceCriteriaHtml} title="Критерии приёмки из Azure DevOps" />
    </section> : null}
  </div>;
}

function PlanTab({ allocations, currentTaskId, canEditPlan, writeEnabled, onOpen, onRetry, retrying }: {
  allocations: RoadmapAllocation[];
  currentTaskId: string;
  canEditPlan: boolean;
  writeEnabled: boolean;
  onOpen: (externalId: string) => void;
  onRetry?: (allocationId: string) => void;
  retrying: boolean;
}) {
  const sorted = [...allocations].sort((left, right) => left.quarterKey.localeCompare(right.quarterKey) || left.personName.localeCompare(right.personName, 'ru'));
  // A divergence with Azure needs a decision, so those rows start open; so does a single row.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(
    sorted.filter((allocation) => allocation.azureSyncStatus === 'conflict' || sorted.length === 1).map((allocation) => allocation.id),
  ));
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return <ul className="-mx-2">
    {sorted.map((allocation) => {
      const open = expanded.has(allocation.id);
      return <li key={allocation.id} className="rounded-lg px-2 py-2.5 hover:bg-muted/40">
        <button type="button" aria-expanded={open} onClick={() => toggle(allocation.id)} className="flex w-full gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-ring">
          <Avatar name={allocation.personName} className="mt-0.5 size-7" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium">{allocation.personName}</span>
              <span className="shrink-0 text-sm tabular-nums">{hours(allocation.estimatedHours) ?? '—'}{Number(allocation.actualHours ?? 0) ? <span className="text-muted-foreground"> · факт {hours(allocation.actualHours)}</span> : null}</span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{allocation.role.name}</span>
              <span aria-hidden="true">·</span>
              <span>{allocation.quarterKey.replace(/^(\d{4})-(Q\d)$/, '$2 $1')}</span>
              <span aria-hidden="true">·</span>
              <SyncStatus allocation={allocation} />
            </span>
          </span>
          <ChevronRight aria-hidden="true" className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
        </button>
        {open ? <AllocationAzurePanel
          compact
          className="mt-2 ml-10"
          allocation={allocation}
          canEditPlan={canEditPlan}
          writeEnabled={writeEnabled}
          retrying={retrying}
          onRetry={onRetry ? () => onRetry(allocation.id) : undefined}
          onOpenTask={allocation.azureTaskId === currentTaskId ? undefined : onOpen}
        /> : null}
      </li>;
    })}
  </ul>;
}

function ChildrenTab({ item, onOpen }: { item: WorkItemCard; onOpen: (externalId: string) => void }) {
  return <ul className="-mx-2">
    {item.children.map((child) => {
      const plan = hours(child.estimates.original);
      const fact = hours(child.estimates.completed);
      return <li key={child.id}>
        <button type="button" onClick={() => onOpen(child.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              <AzureWorkItemIcon type={child.type} className="mt-0.5" />
              <span className="text-sm [overflow-wrap:anywhere]">{child.title}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 pl-6 text-xs text-muted-foreground">
              <span className="tabular-nums">{child.type} {child.id}</span>
              <span aria-hidden="true">·</span>
              <span>{child.assignedTo?.name ?? 'не назначен'}</span>
              {plan || fact ? <><span aria-hidden="true">·</span><span className="tabular-nums">{plan ?? '—'}{fact ? ` / факт ${fact}` : ''}</span></> : null}
            </span>
          </span>
          <WorkItemStateBadge state={child.state} className="mt-0.5 shrink-0" />
        </button>
      </li>;
    })}
  </ul>;
}

function DiscussionTab({ item, projectId }: { item: WorkItemCard; projectId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const comment = useMutation({
    mutationFn: (body: string) => workItemCardApi.comment(projectId, item.id, body),
    onSuccess: (comments) => {
      setText('');
      queryClient.setQueryData<WorkItemCard>(workItemCardQueryKey(projectId, item.id), (current) => current ? { ...current, comments } : current);
    },
  });
  const send = () => { if (text.trim() && !comment.isPending) comment.mutate(text); };
  return <div className="space-y-5">
    {item.canEdit ? <form className="rounded-lg border border-input bg-card focus-within:ring-2 focus-within:ring-ring/40" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <textarea aria-label="Комментарий" value={text} onChange={(event) => setText(event.target.value)} rows={text ? 3 : 2} maxLength={10000} placeholder="Написать комментарий…" className="block w-full resize-none rounded-t-lg bg-transparent px-3 py-2 text-sm outline-none"
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); } }} />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <span className="px-1 text-xs text-muted-foreground">{comment.error ? <span role="alert" className="text-destructive">{comment.error.message}</span> : 'Уйдёт в обсуждение в Azure DevOps · Ctrl+Enter'}</span>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!text.trim() || comment.isPending}>{comment.isPending ? 'Отправляем…' : 'Отправить'}</Button>
      </div>
    </form> : null}
    {item.comments.length ? <ul className="space-y-5">
      {item.comments.map((entry) => <li key={entry.id} className="flex gap-3">
        <Avatar name={entry.author?.name ?? '?'} className="mt-0.5 size-7" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{entry.author?.name ?? '—'}</span> · {formatDate(entry.createdAt, true)}{entry.edited ? ' · изменён' : ''}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{entry.text}</p>
        </div>
      </li>)}
    </ul> : <EmptyState icon={MessageSquare} text="Комментариев пока нет" />}
  </div>;
}

/** Folds runs of link-only updates by the same person into one entry, so bulk re-parenting reads as one change. */
function groupHistory(history: WorkItemCard['history']) {
  const grouped: WorkItemCard['history'] = [];
  for (const entry of history) {
    const previous = grouped.at(-1);
    const linkOnly = (value: typeof entry) => !value.created && !value.changes.length;
    if (previous && linkOnly(previous) && linkOnly(entry) && previous.author?.name === entry.author?.name) {
      grouped[grouped.length - 1] = { ...previous, linksAdded: previous.linksAdded + entry.linksAdded, linksRemoved: previous.linksRemoved + entry.linksRemoved };
    } else {
      grouped.push(entry);
    }
  }
  return grouped;
}

/** The Azure history and the plan changes (Roadmap) of one item, newest first. */
function HistoryTab({ item, planChanges, onOpenTask }: { item: WorkItemCard | null; planChanges?: UseQueryResult<PlanChangePage>; onOpenTask: (azureTaskId: string) => void }) {
  const azureEntries = item ? groupHistory(item.history) : [];
  const planGroups = groupByBatch(planChanges?.data?.items ?? []);
  const timeOf = (value: string | null) => {
    const time = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(time) ? 0 : time;
  };
  const entries = [
    ...azureEntries.map((entry) => ({ key: `azure:${entry.id}`, time: timeOf(entry.changedAt), entry, group: null })),
    ...planGroups.map((group) => ({ key: `plan:${group.items[0].id}`, time: timeOf(group.items[0].createdAt), entry: null, group })),
  ].sort((a, b) => b.time - a.time);
  const planPending = Boolean(planChanges?.isPending && planChanges.fetchStatus !== 'idle');

  if (!entries.length && !planPending && !planChanges?.isError) return <EmptyState icon={History} text="Изменений пока нет" />;
  return <div className="space-y-4">
    {planChanges?.isError ? <ErrorNotice title="Не удалось загрузить изменения плана" errors={[planChanges.error]} onRetry={() => planChanges.refetch()} retrying={planChanges.isFetching} /> : null}
    {planPending ? <p role="status" className="text-xs text-muted-foreground">Загружаем изменения плана…</p> : null}
    {entries.length ? <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
      {entries.map(({ key, entry, group }) => <li key={key} className="relative pl-6">
        <span aria-hidden="true" className={cn('absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-card', group ? 'bg-primary/60' : 'bg-muted-foreground/40')} />
        {group ? <PlanChangeEntry group={group} onOpenTask={onOpenTask} /> : entry ? <AzureHistoryEntry entry={entry} /> : null}
      </li>)}
    </ol> : null}
    {planChanges?.data?.nextCursor ? <p className="text-xs text-muted-foreground">Показаны последние {PLAN_CHANGES_LIMIT} изменений</p> : null}
  </div>;
}

function AzureHistoryEntry({ entry }: { entry: WorkItemCard['history'][number] }) {
  return <>
    <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{entry.author?.name ?? '—'}</span> · {formatDate(entry.changedAt, true)}</p>
    <dl className="mt-1.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {entry.created ? <dt className="col-span-2 font-medium">Создан элемент</dt> : null}
      {entry.changes.map((change, index) => <Fragment key={`${change.field}:${index}`}>
        <dt className="text-muted-foreground">{change.field}</dt>
        <dd className="[overflow-wrap:anywhere]">
          {change.from === null && change.to === null ? <span className="text-muted-foreground">изменено</span>
            : <>{change.from && !entry.created ? <><span className="text-muted-foreground line-through decoration-muted-foreground/50">{change.from}</span><span aria-hidden="true" className="text-muted-foreground"> → </span></> : null}{change.to ?? <span className="text-muted-foreground">пусто</span>}</>}
        </dd>
      </Fragment>)}
      {entry.linksAdded || entry.linksRemoved ? <><dt className="text-muted-foreground">Связи</dt><dd>{[
        entry.linksAdded ? `добавлено ${entry.linksAdded}` : null,
        entry.linksRemoved ? `удалено ${entry.linksRemoved}` : null,
      ].filter(Boolean).join(', ')}</dd></> : null}
    </dl>
  </>;
}
