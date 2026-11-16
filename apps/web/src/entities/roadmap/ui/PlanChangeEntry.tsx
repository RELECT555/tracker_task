'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { PlanChange } from '../api/planChangesApi';
import { describePlanChange, describePlanChangeGroup, formatPlanChangeTime, type PlanChangeGroup } from '../lib/plan-change-text';

export interface PlanChangeEntryProps {
  group: PlanChangeGroup;
  /** Makes entries clickable; the project feed uses it to open the work item card. */
  onOpenWorkItem?: (externalId: string) => void;
  /** Names the work item on each entry: the project feed needs it, the item's own history does not. */
  showWorkItem?: boolean;
}

/** «Roadmap» for edits made in the plan, «Ассистент» for the ones the AI assistant suggested. */
export function PlanChangeSourceBadge({ source }: { source: PlanChange['source'] }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 text-[10px] font-medium leading-4 text-muted-foreground">
    {source === 'ai' ? 'Ассистент' : 'Roadmap'}
  </span>;
}

const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase('ru-RU') + value.slice(1);

/** Wraps content in a full-width button when the entry can be opened. */
function Clickable({ onOpen, className, children, label }: { onOpen?: () => void; className?: string; children: ReactNode; label?: string }) {
  if (!onOpen) return <div className={className}>{children}</div>;
  return <button
    type="button"
    onClick={onOpen}
    aria-label={label}
    className={cn('block w-full rounded-md text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring', className)}
  >{children}</button>;
}

function ChangeBody({ change, showWorkItem }: { change: PlanChange; showWorkItem: boolean }) {
  const { verb, text, origin, context } = describePlanChange(change);
  return <>
    {showWorkItem ? <span className="block truncate text-sm font-medium" title={change.workItemTitle}>{change.workItemTitle}</span> : null}
    <span className="block text-sm [overflow-wrap:anywhere]">
      {origin ? <><span className="font-medium">{origin}</span>: {lowerFirst(verb)}</> : <span className="font-medium">{verb}</span>}
      {text ? <>: {text}</> : null}
    </span>
    {context ? <span className="mt-0.5 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{context}</span> : null}
  </>;
}

function ChangeMeta({ change }: { change: PlanChange }) {
  const { author } = describePlanChange(change);
  return <span className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
    <span className="font-medium text-foreground">{author}</span>
    <span aria-hidden="true">·</span>
    <time dateTime={change.createdAt}>{formatPlanChangeTime(change.createdAt)}</time>
    <PlanChangeSourceBadge source={change.source} />
  </span>;
}

/** One action in the plan log: a single change, or several made by one click, folded into an expandable group. */
export function PlanChangeEntry({ group, onOpenWorkItem, showWorkItem = false }: PlanChangeEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const [first] = group.items;

  if (group.items.length === 1) {
    return <Clickable
      className={cn(onOpenWorkItem && '-mx-2 px-2 py-1.5')}
      onOpen={onOpenWorkItem ? () => onOpenWorkItem(first.workItemExternalId) : undefined}
    >
      <ChangeMeta change={first} />
      <ChangeBody change={first} showWorkItem={showWorkItem} />
    </Clickable>;
  }

  const { title } = describePlanChangeGroup(group);
  return <div>
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={listId}
      onClick={() => setExpanded((value) => !value)}
      className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ChevronRight aria-hidden="true" className={cn('mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', expanded && 'rotate-90')} />
      <span className="min-w-0 flex-1">
        <span className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <time dateTime={first.createdAt}>{formatPlanChangeTime(first.createdAt)}</time>
          <PlanChangeSourceBadge source={first.source} />
        </span>
        <span className="block text-sm font-medium [overflow-wrap:anywhere]">{title}</span>
      </span>
    </button>
    {expanded ? <ul id={listId} className="mt-1 ml-1.5 space-y-1 border-l border-border pl-3">
      {group.items.map((change) => <li key={change.id}>
        <Clickable
          className={cn(onOpenWorkItem && '-mx-2 px-2 py-1.5')}
          onOpen={onOpenWorkItem ? () => onOpenWorkItem(change.workItemExternalId) : undefined}
        >
          <ChangeBody change={change} showWorkItem={showWorkItem} />
        </Clickable>
      </li>)}
    </ul> : null}
  </div>;
}
