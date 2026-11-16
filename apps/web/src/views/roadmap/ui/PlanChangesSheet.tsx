'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History, X } from 'lucide-react';
import { planChangesApi, planChangesQueryKey } from '@/entities/roadmap/api/planChangesApi';
import type { RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { groupByBatch } from '@/entities/roadmap/lib/plan-change-text';
import { PlanChangeEntry } from '@/entities/roadmap/ui/PlanChangeEntry';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/error-notice';
import { Input } from '@/shared/ui/input';
import { SearchableSelect, type SearchableSelectOption } from '@/shared/ui/searchable-select';

const PAGE_SIZE = 50;
const ANYONE = '__anyone__';

export interface PlanChangesSheetProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the Azure id of the entry's work item; the sheet closes itself first. */
  onOpenWorkItem: (externalId: string) => void;
  /** Roles of the loaded plan: their members are the people to filter by. */
  roles: RoadmapRole[];
}

/** Project change log in a side panel, the same pattern as the work item card. */
export function PlanChangesSheet({ projectId, open, onClose, onOpenWorkItem, roles }: PlanChangesSheetProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      setPortal(element);
    }
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      className="roadmap-sheet fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[34rem] overflow-hidden border-l border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/25"
      onClose={() => { if (open) onClose(); }}
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      {open ? <FeedContent
        titleId={`${id}-title`}
        projectId={projectId}
        roles={roles}
        portal={portal}
        onClose={onClose}
        onOpenWorkItem={(externalId) => { onClose(); onOpenWorkItem(externalId); }}
      /> : null}
    </dialog>
  );
}

/** `YYYY-MM-DD` from a date input → midnight of that day in the viewer's time zone. */
function startOfLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Last millisecond of that local day. The API includes a date-time `to` (`createdAt <= to`) and
 * keeps millisecond precision, so this takes the whole day and nothing of the next one.
 */
function endOfLocalDay(value: string): Date {
  const start = startOfLocalDay(value);
  return new Date(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime() - 1);
}

function peopleOptions(roles: RoadmapRole[]): SearchableSelectOption[] {
  const seen = new Map<string, string>();
  for (const role of roles) {
    for (const member of role.members ?? []) {
      if (!seen.has(member.personExternalId)) seen.set(member.personExternalId, member.personName);
    }
  }
  return [
    { value: ANYONE, label: 'Все люди' },
    ...[...seen].sort((a, b) => a[1].localeCompare(b[1], 'ru')).map(([value, label]) => ({ value, label })),
  ];
}

function FeedContent({ titleId, projectId, roles, portal, onClose, onOpenWorkItem }: {
  titleId: string;
  projectId: string;
  roles: RoadmapRole[];
  portal: HTMLElement | null;
  onClose: () => void;
  onOpenWorkItem: (externalId: string) => void;
}) {
  const [person, setPerson] = useState(ANYONE);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const options = useMemo(() => peopleOptions(roles), [roles]);
  const filtered = person !== ANYONE || Boolean(from) || Boolean(to);

  const feed = useInfiniteQuery({
    queryKey: planChangesQueryKey(projectId, 'feed', person, from, to),
    queryFn: ({ pageParam, signal }) => planChangesApi.list(projectId, {
      personExternalId: person === ANYONE ? undefined : person,
      from: from ? startOfLocalDay(from).toISOString() : undefined,
      to: to ? endOfLocalDay(to).toISOString() : undefined,
      cursor: pageParam,
      limit: PAGE_SIZE,
    }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  const groups = useMemo(() => groupByBatch(feed.data?.pages.flatMap((page) => page.items) ?? []), [feed.data]);

  // Loads the next page when the end of the list scrolls into view.
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = feed;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
    }, { root: scroller.current, rootMargin: '0px 0px 160px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, groups.length]);

  return <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
      <h2 id={titleId} className="min-w-0 truncate text-sm font-medium">Журнал изменений</h2>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Закрыть журнал изменений" onClick={onClose}><X aria-hidden="true" className="size-4" /></Button>
    </header>

    <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 sm:px-6">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Исполнитель</p>
        <SearchableSelect
          ariaLabel="Исполнитель"
          value={person}
          onChange={setPerson}
          options={options}
          searchable={options.length > 8}
          searchPlaceholder="Найти человека…"
          portalContainer={portal}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">С даты</span>
          <Input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="h-9 dark:[color-scheme:dark]" />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">По дату</span>
          <Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="h-9 dark:[color-scheme:dark]" />
        </label>
      </div>
      {filtered ? <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 text-xs text-muted-foreground" onClick={() => { setPerson(ANYONE); setFrom(''); setTo(''); }}>Сбросить фильтры</Button> : null}
    </div>

    <div ref={scroller} className="min-h-0 flex-1 roadmap-scrollbar overflow-y-auto px-4 py-4 sm:px-6">
      {feed.isPending ? <div role="status" aria-label="Загружаем журнал изменений" className="space-y-4">
        {[0, 1, 2, 3].map((row) => <div key={row} className="space-y-2"><div className="h-3 w-1/3 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" /><div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>)}
      </div> : feed.isError && !feed.data ? <ErrorNotice title="Не удалось загрузить журнал изменений" errors={[feed.error]} onRetry={() => feed.refetch()} retrying={feed.isFetching} />
        : <>
        {/* A failed background refresh keeps what is already shown; a failed next page has its own notice below. */}
        {feed.isError && !feed.isFetchNextPageError ? <div className="mb-4"><ErrorNotice title="Не удалось обновить журнал изменений" errors={[feed.error]} onRetry={() => feed.refetch()} retrying={feed.isFetching} /></div> : null}
        {!groups.length ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"><History className="size-4" /></span>
          <p className="text-sm text-muted-foreground">{filtered ? 'По этим фильтрам изменений нет' : 'Изменений пока нет'}</p>
        </div> : <>
          <ul className="space-y-4">
            {groups.map((group) => <li key={`${group.batchId}:${group.items[0].id}`} className="border-b border-border pb-4 last:border-b-0">
              <PlanChangeEntry group={group} showWorkItem onOpenWorkItem={onOpenWorkItem} onOpenTask={onOpenWorkItem} />
            </li>)}
          </ul>
          <div ref={sentinel} className="h-px" aria-hidden="true" />
          {feed.hasNextPage ? <div className="flex flex-col items-center gap-2 pt-3">
            {feed.isFetchNextPageError ? <p role="alert" className="text-xs text-destructive">Не удалось загрузить продолжение.</p> : null}
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}</Button>
          </div> : null}
        </>}
      </>}
    </div>
  </div>;
}
