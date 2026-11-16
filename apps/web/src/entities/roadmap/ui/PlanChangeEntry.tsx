'use client';

import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { PlanChange } from '../api/planChangesApi';
import { describePlanChange, describePlanChangeGroup, formatPlanChangeTime, type PlanChangeGroup } from '../lib/plan-change-text';

export interface PlanChangeEntryProps {
  group: PlanChangeGroup;
  /** Makes entries clickable; the project feed uses it to open the work item card. */
  onOpenWorkItem?: (externalId: string) => void;
  /** Opens the card of the Azure Task an Azure-sourced entry came from (by the Task's Azure id). */
  onOpenTask?: (azureTaskId: string) => void;
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

const taskLinkClass = 'rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring';

/** `#N` of the Task: a control when it can be opened here, plain text otherwise. */
function TaskRef({ taskId, onOpenTask }: { taskId: string; onOpenTask?: (azureTaskId: string) => void }) {
  if (!onOpenTask) return <>#{taskId}</>;
  return <button type="button" onClick={() => onOpenTask(taskId)} aria-label={`Открыть задачу #${taskId}`} className={taskLinkClass}>#{taskId}</button>;
}

function ChangeBody({ change, showWorkItem, onOpenTask }: { change: PlanChange; showWorkItem: boolean; onOpenTask?: (azureTaskId: string) => void }) {
  const { verb, text, origin, taskId, context } = describePlanChange(change);
  return <>
    {showWorkItem ? <span className="block truncate text-sm font-medium" title={change.workItemTitle}>{change.workItemTitle}</span> : null}
    <span className="block text-sm [overflow-wrap:anywhere]">
      {origin ? <><span className="font-medium">{origin}{taskId ? <> (задача <TaskRef taskId={taskId} onOpenTask={onOpenTask} />)</> : null}</span>: {lowerFirst(verb)}</> : <span className="font-medium">{verb}</span>}
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

/**
 * One change. With `onOpen` the whole entry is a button; a Task control cannot live inside it,
 * so it then sits as a separate small control under the entry.
 */
function ChangeItem({ change, showWorkItem, withMeta, onOpen, onOpenTask }: {
  change: PlanChange;
  showWorkItem: boolean;
  withMeta: boolean;
  onOpen?: () => void;
  onOpenTask?: (azureTaskId: string) => void;
}) {
  const content = (taskControl?: (azureTaskId: string) => void) => <>
    {withMeta ? <ChangeMeta change={change} /> : null}
    <ChangeBody change={change} showWorkItem={showWorkItem} onOpenTask={taskControl} />
  </>;
  if (!onOpen) return <div>{content(onOpenTask)}</div>;

  const { taskId } = describePlanChange(change);
  return <div>
    <button
      type="button"
      onClick={onOpen}
      className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
    >{content()}</button>
    {taskId && onOpenTask ? <button type="button" onClick={() => onOpenTask(taskId)} className={cn('mt-0.5 text-xs', taskLinkClass)}>Открыть задачу #{taskId}</button> : null}
  </div>;
}

/** One action in the plan log: a single change, or several made by one click, folded into an expandable group. */
export function PlanChangeEntry({ group, onOpenWorkItem, onOpenTask, showWorkItem = false }: PlanChangeEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const [first] = group.items;
  const openerOf = (change: PlanChange) => onOpenWorkItem ? () => onOpenWorkItem(change.workItemExternalId) : undefined;

  if (group.items.length === 1) {
    return <ChangeItem change={first} showWorkItem={showWorkItem} withMeta onOpen={openerOf(first)} onOpenTask={onOpenTask} />;
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
        <ChangeItem change={change} showWorkItem={showWorkItem} withMeta={false} onOpen={openerOf(change)} onOpenTask={onOpenTask} />
      </li>)}
    </ul> : null}
  </div>;
}
