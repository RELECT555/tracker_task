'use client';

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ChevronRight, ExternalLink, Lock, Pencil, RefreshCw, X } from 'lucide-react';
import type { RoadmapAllocation, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { workItemCardApi, workItemCardQueryKey, type WorkItemCard, type WorkItemCardPerson, type WorkItemCardUpdate } from '@/entities/roadmap/api/workItemCardApi';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { SafeAzureHtml } from '@/entities/roadmap/ui/SafeAzureHtml';
import { WorkItemStateBadge } from '@/entities/roadmap/ui/WorkItemStateBadge';
import { ApiError } from '@/shared/api/client';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/error-notice';
import { SearchableSelect, type SearchableSelectOption } from '@/shared/ui/searchable-select';

type Tab = 'description' | 'plan' | 'children' | 'discussion' | 'history';

const UNASSIGNED = '__unassigned__';
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** Ghost look for selects inside the property list: no box until hovered. */
const inlineSelect = 'min-h-8 -ml-2 w-auto max-w-full border-transparent bg-transparent px-2 py-1 shadow-none hover:bg-muted/60';

function formatDate(value: string | null, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : (withTime ? dateTimeFormat : dateFormat).format(date);
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

function Property({ label, children }: { label: string; children: ReactNode }) {
  return <>
    <dt className="py-1.5 text-sm text-muted-foreground">{label}</dt>
    <dd className="flex min-h-8 min-w-0 items-center py-0.5 text-sm text-foreground [overflow-wrap:anywhere]">{children}</dd>
  </>;
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
}

export function WorkItemCardSheet({ projectId, externalId, onNavigate, planItems, onRetryAllocation, retrying = false }: WorkItemCardSheetProps) {
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
          portal={portal}
          canGoBack={trail.length > 0}
          onBack={back}
          onClose={close}
          onOpen={open}
          onRetryAllocation={onRetryAllocation}
          retrying={retrying}
        />
      ) : null}
    </dialog>
  );
}

function CardContent({ titleId, projectId, externalId, planItem, portal, canGoBack, onBack, onClose, onOpen, onRetryAllocation, retrying }: {
  titleId: string;
  projectId: string;
  externalId: string;
  planItem?: RoadmapWorkItem;
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
  const allocations = planItem?.allocations ?? [];
  const [tab, setTab] = useState<Tab>(allocations.length ? 'plan' : 'description');

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
        <button type="button" onClick={() => onOpen(item.parent!.id)} title={item.parent.title} className="inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
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
      <div role="status" aria-label="Загружаем карточку из Azure DevOps" className="space-y-4 px-6 py-6">
        <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
        <div className="space-y-2.5 pt-2">{[0, 1, 2, 3].map((row) => <div key={row} className="h-5 w-1/2 animate-pulse rounded bg-muted/70" />)}</div>
        <div className="h-28 animate-pulse rounded bg-muted/50" />
      </div>
    </div>;
  }
  if (card.isError) {
    return <div className="flex h-full flex-col">
      {header()}
      <div className="px-6 py-4">
        <ErrorNotice title="Не удалось открыть элемент из Azure DevOps" errors={[card.error]} onRetry={() => card.refetch()} retrying={card.isFetching} />
        {planItem?.url ? <a href={planItem.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Открыть в Azure DevOps<ExternalLink aria-hidden="true" className="size-3.5" /></a> : null}
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

  return <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
    {header(item)}

    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="px-6 pt-5 pb-6">
        <EditableTitle id={titleId} value={item.title} editable={item.canEdit} saving={update.isPending} onSave={(title) => update.mutate({ title })} />
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {changed ? <span>Изменено {changed}{item.changedBy ? ` · ${item.changedBy.name}` : ''}</span> : null}
          {!item.canEdit && item.readOnlyReason ? <span title={item.readOnlyReason} className="inline-flex items-center gap-1"><Lock aria-hidden="true" className="size-3" />Только просмотр<span className="sr-only">: {item.readOnlyReason}</span></span> : null}
        </p>

        {update.error ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
          <span className="flex min-w-0 items-start gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{update.error.message}</span>
          {conflict ? <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={refresh}>Обновить карточку</Button> : null}
        </div> : null}

        <dl className="mt-5 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4">
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
          {item.iterationPath ? <Property label="Итерация">{item.iterationPath}</Property> : null}
          {item.areaPath ? <Property label="Область">{item.areaPath}</Property> : null}
          {item.priority !== null ? <Property label="Приоритет">{item.priority}</Property> : null}
          {hasHours ? <Property label="Часы">
            <span className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              {original !== null ? <span><span className="text-muted-foreground">оценка </span>{hours(original)}</span> : null}
              {remaining !== null ? <span><span className="text-muted-foreground">осталось </span>{hours(remaining)}</span> : null}
              {completed !== null ? <span><span className="text-muted-foreground">факт </span>{hours(completed)}</span> : null}
            </span>
          </Property> : null}
          {item.tags.length || item.canEdit ? <Property label="Теги">
            <EditableTags value={item.tags} editable={item.canEdit} saving={update.isPending} onSave={(tags) => update.mutate({ tags })} />
          </Property> : null}
        </dl>
      </section>

      <div role="tablist" aria-label="Разделы карточки" className="sticky top-0 z-10 flex gap-5 overflow-x-auto border-b border-border bg-card px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((entry) => <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          onClick={() => setTab(entry.id)}
          className={cn('-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', tab === entry.id ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          {entry.label}{entry.count ? <span className="text-xs tabular-nums text-muted-foreground">{entry.count}</span> : null}
        </button>)}
      </div>

      <div role="tabpanel" className="px-6 py-5">
        {tab === 'description' ? <DescriptionTab item={item} saving={update.isPending} onSave={(description) => update.mutateAsync({ description })} /> : null}
        {tab === 'plan' ? <PlanTab allocations={allocations} onOpen={onOpen} onRetry={onRetryAllocation} retrying={retrying} /> : null}
        {tab === 'children' ? <ChildrenTab item={item} onOpen={onOpen} /> : null}
        {tab === 'discussion' ? <DiscussionTab item={item} projectId={projectId} /> : null}
        {tab === 'history' ? <HistoryTab item={item} /> : null}
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
      className="-mx-2 w-[calc(100%+1rem)] resize-none rounded-md border border-input bg-background px-2 py-0.5 text-xl font-semibold leading-snug tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
    />
    <p className="mt-1 text-xs text-muted-foreground">Enter — сохранить, Esc — отменить</p>
  </div>;
}

function EditableTags({ value, editable, saving, onSave }: { value: string[]; editable: boolean; saving: boolean; onSave: (value: string[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return <div className="flex flex-wrap items-center gap-1.5">
      {value.map((tag) => <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{tag}</span>)}
      {editable ? <button type="button" onClick={() => setDraft(value.join(', '))} className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{value.length ? 'Изменить' : 'Добавить'}</button> : null}
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
    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
  />;
}

function DescriptionTab({ item, saving, onSave }: { item: WorkItemCard; saving: boolean; onSave: (description: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void onSave(draft).then(() => setDraft(null), () => undefined); }}>
      <textarea autoFocus aria-label="Описание" value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring" />
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
      {item.descriptionHtml ? <SafeAzureHtml html={item.descriptionHtml} title="Описание из Azure DevOps" /> : <p className="text-sm text-muted-foreground">Описания нет.</p>}
      {editable ? <Button type="button" size="sm" variant="ghost" className="mt-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setDraft(item.descriptionText)}><Pencil aria-hidden="true" className="size-3.5" />{item.descriptionHtml ? 'Изменить' : 'Добавить описание'}</Button> : null}
      {item.canEdit && !item.descriptionEditable ? <p className="mt-3 text-xs text-muted-foreground">Описание с форматированием меняется в Azure DevOps, чтобы не потерять разметку.</p> : null}
    </div>
    {item.acceptanceCriteriaHtml ? <section>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Критерии приёмки</h3>
      <SafeAzureHtml html={item.acceptanceCriteriaHtml} title="Критерии приёмки из Azure DevOps" />
    </section> : null}
  </div>;
}

function PlanTab({ allocations, onOpen, onRetry, retrying }: { allocations: RoadmapAllocation[]; onOpen: (externalId: string) => void; onRetry?: (allocationId: string) => void; retrying: boolean }) {
  const sorted = [...allocations].sort((left, right) => left.quarterKey.localeCompare(right.quarterKey) || left.personName.localeCompare(right.personName, 'ru'));
  return <ul className="-mx-2">
    {sorted.map((allocation) => {
      const canRetry = onRetry && allocation.azureSyncStatus !== 'synced' && allocation.azureSyncStatus !== 'pending' && allocation.azureSyncStatus !== 'sending';
      return <li key={allocation.id} className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40">
        <Avatar name={allocation.personName} className="mt-0.5 size-7" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{allocation.personName}</span>
            <span className="shrink-0 text-sm tabular-nums">{hours(allocation.estimatedHours) ?? '—'}{Number(allocation.actualHours ?? 0) ? <span className="text-muted-foreground"> · факт {hours(allocation.actualHours)}</span> : null}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{allocation.role.name}</span>
            <span aria-hidden="true">·</span>
            <span>{allocation.quarterKey.replace(/^(\d{4})-(Q\d)$/, '$2 $1')}</span>
            <span aria-hidden="true">·</span>
            <SyncStatus allocation={allocation} />
            {allocation.azureTaskId ? <><span aria-hidden="true">·</span><button type="button" onClick={() => onOpen(allocation.azureTaskId!)} className="rounded hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">Task {allocation.azureTaskId}</button></> : null}
            {canRetry ? <><span aria-hidden="true">·</span><button type="button" disabled={retrying} onClick={() => onRetry(allocation.id)} className="rounded font-medium text-primary hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">{retrying ? 'Отправляем…' : 'Отправить снова'}</button></> : null}
          </div>
          {allocation.azureSyncError ? <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{allocation.azureSyncError}</p> : null}
        </div>
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
            <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
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
    {item.canEdit ? <form className="rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40" onSubmit={(event) => { event.preventDefault(); send(); }}>
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
    </ul> : <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>}
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

function HistoryTab({ item }: { item: WorkItemCard }) {
  if (!item.history.length) return <p className="text-sm text-muted-foreground">Изменений пока нет.</p>;
  return <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
    {groupHistory(item.history).map((entry) => <li key={entry.id} className="relative pl-6">
      <span aria-hidden="true" className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-card bg-muted-foreground/40" />
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
    </li>)}
  </ol>;
}
