'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  X,
} from 'lucide-react';
import { STATUS_LABELS, TRANSITION_ACTION_LABELS, type RequestStatus } from '@tracker/shared';
import type { RequestTransition } from '@/entities/request/api/requestApi';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

type StepStatus = 'success' | 'error' | 'warning' | 'active' | 'neutral';

type HistoryStep = {
  id: string;
  title: string;
  status: StepStatus;
  icon: ReactNode;
  /** Time spent on the previous stage, i.e. the gap before this event. */
  duration: string | null;
  createdAt: string | null;
  statusChange: string | null;
  actor: string | null;
  comment: string | null;
};

const TERMINAL_STATUSES: RequestStatus[] = ['approved', 'rejected', 'cancelled', 'draft'];

export function RequestHistoryTimeline({
  transitions,
  status,
  embedded = false,
}: {
  transitions: RequestTransition[];
  /** Current request status — drives the trailing "in progress" step. */
  status?: RequestStatus;
  embedded?: boolean;
}) {
  const [isMainExpanded, setIsMainExpanded] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  if (transitions.length === 0) {
    return null;
  }

  const steps = buildSteps(transitions, status);
  const hasActive = steps.some((step) => step.status === 'active');
  const toggleStep = (id: string) =>
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));

  const content = (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isExpanded = expandedSteps[step.id] ?? false;

        return (
          <li
            key={step.id}
            className="animate-in fade-in slide-in-from-top-1 duration-300 relative flex gap-3.5"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[11px] top-7 bottom-[-6px] w-[2px] bg-border/60"
              />
            ) : null}

            <span
              aria-hidden
              className={cn(
                'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card transition-colors',
                statusCircleClass(step.status),
              )}
            >
              {step.icon}
            </span>

            <div className="min-w-0 flex-1 pb-5 last:pb-0">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleStep(step.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleStep(step.id);
                  }
                }}
                className="group -mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    'truncate text-sm leading-snug tracking-tight',
                    step.status === 'error' && 'font-semibold text-destructive',
                    step.status === 'active' && 'font-semibold text-foreground',
                    step.status !== 'error' &&
                      step.status !== 'active' &&
                      'font-medium text-foreground/80 group-hover:text-foreground',
                  )}
                >
                  {step.title}
                </span>

                <span className="flex shrink-0 items-center gap-2.5">
                  {step.duration ? (
                    <span
                      className={cn(
                        'font-mono text-[11px] tabular-nums',
                        step.status === 'active' ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {step.duration}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground/40 transition-colors group-hover:text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                </span>
              </div>

              {step.statusChange || step.actor ? (
                <p className="mt-0.5 truncate text-xs leading-relaxed text-muted-foreground">
                  {[step.statusChange, step.actor].filter(Boolean).join(' · ')}
                </p>
              ) : null}

              <div
                className={cn(
                  'grid transition-all duration-300 ease-in-out',
                  isExpanded
                    ? 'mt-2 grid-rows-[1fr] opacity-100'
                    : 'mt-0 grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden">
                  <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 font-mono text-[11px] leading-relaxed dark:bg-muted/20">
                    {step.createdAt ? (
                      <>
                        <dt className="text-muted-foreground">Время</dt>
                        <dd className="tabular-nums text-foreground">
                          {new Date(step.createdAt).toLocaleString('ru-RU')}
                        </dd>
                      </>
                    ) : null}
                    {step.statusChange ? (
                      <>
                        <dt className="text-muted-foreground">Статус</dt>
                        <dd className="text-foreground">{step.statusChange}</dd>
                      </>
                    ) : null}
                    {step.actor ? (
                      <>
                        <dt className="text-muted-foreground">Автор</dt>
                        <dd className="text-foreground">{step.actor}</dd>
                      </>
                    ) : null}
                    {step.duration ? (
                      <>
                        <dt className="text-muted-foreground">Ожидание</dt>
                        <dd className="tabular-nums text-foreground">{step.duration}</dd>
                      </>
                    ) : null}
                  </dl>

                  {step.comment ? (
                    <p className="mt-2 flex gap-2 rounded-md border border-border/70 bg-card px-2.5 py-2 text-sm leading-relaxed text-foreground">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">{step.comment}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );

  if (embedded) return content;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        onClick={() => setIsMainExpanded((prev) => !prev)}
        className={cn(
          'cursor-pointer select-none py-4 transition-colors',
          isMainExpanded
            ? 'border-b border-border/60 bg-muted/20 dark:bg-muted/10'
            : 'hover:bg-muted/20',
        )}
      >
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {hasActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <History className="h-4 w-4 text-muted-foreground" />
            )}
            История изменений
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
              {transitions.length}
            </span>
          </span>
          <span className="text-muted-foreground">
            {isMainExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <div
        className={cn(
          'grid transition-all duration-500 ease-in-out',
          isMainExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <CardContent className="pt-5">{content}</CardContent>
        </div>
      </div>
    </Card>
  );
}

/**
 * Transitions, plus a synthetic trailing step while the request is still in
 * flight — so the timeline shows what it is waiting on, not just what happened.
 */
function buildSteps(
  transitions: RequestTransition[],
  status: RequestStatus | undefined,
): HistoryStep[] {
  const steps: HistoryStep[] = transitions.map((item, index) => {
    const previous = index > 0 ? transitions[index - 1] : null;

    return {
      id: item.id,
      title: TRANSITION_ACTION_LABELS[item.action] ?? item.action,
      status: actionStatus(item.action),
      icon: actionIcon(item.action),
      duration: previous ? formatElapsed(previous.createdAt, item.createdAt) : null,
      createdAt: item.createdAt,
      statusChange: formatStatusChange(
        item.fromStatus,
        item.toStatus,
        item.fromStep,
        item.toStep,
      ),
      actor: item.actor?.fullName ?? null,
      comment: item.comment,
    };
  });

  if (status && !TERMINAL_STATUSES.includes(status)) {
    const last = transitions[transitions.length - 1];
    steps.push({
      id: 'pending-now',
      title:
        status === 'pending_info'
          ? 'Ожидается уточнение от автора'
          : 'Ожидает решения согласующего',
      status: 'active',
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      duration: formatElapsed(last.createdAt, new Date().toISOString()),
      createdAt: null,
      statusChange: STATUS_LABELS[status],
      actor: null,
      comment: null,
    });
  }

  return steps;
}

/** Compact ru elapsed time between two ISO timestamps ("2 ч 14 мин"). */
function formatElapsed(from: string, to: string): string | null {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))} с`;
  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} д ${restHours} ч` : `${days} д`;
}

function formatStatusChange(
  fromStatus: RequestStatus | null,
  toStatus: RequestStatus,
  fromStep: number | null,
  toStep: number | null,
): string {
  const fromLabel = fromStatus ? STATUS_LABELS[fromStatus] : null;
  const toLabel = STATUS_LABELS[toStatus];

  if (fromStatus && fromStatus !== toStatus && fromLabel) {
    return `${fromLabel} → ${toLabel}`;
  }

  if (fromStep !== null && toStep !== null && fromStep !== toStep && fromStatus === toStatus) {
    return `${toLabel}, шаг ${fromStep + 1} → ${toStep + 1}`;
  }

  return toLabel;
}

function actionStatus(action: string): StepStatus {
  switch (action) {
    case 'approve':
    case 'provide_info':
      return 'success';
    case 'reject':
    case 'cancel':
      return 'error';
    case 'request_info':
    case 'escalate':
    case 'sla_escalate':
      return 'warning';
    default:
      return 'neutral';
  }
}

function statusCircleClass(status: StepStatus): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400';
    case 'error':
      return 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400';
    case 'warning':
      return 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400';
    case 'active':
      return 'bg-primary/15 text-primary';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function actionIcon(action: string) {
  const className = 'h-3.5 w-3.5';

  switch (action) {
    case 'approve':
    case 'provide_info':
      return <Check className={className} />;
    case 'reject':
      return <X className={className} />;
    case 'cancel':
      return <Ban className={className} />;
    case 'request_info':
      return <AlertTriangle className={className} />;
    case 'escalate':
    case 'sla_escalate':
      return <ArrowUpRight className={className} />;
    case 'submit':
      return <Send className={className} />;
    case 'update':
    case 'edit':
      return <Pencil className={className} />;
    case 'sla_warning':
      return <Clock className={className} />;
    default:
      return <span className="h-1.5 w-1.5 rounded-full bg-current" />;
  }
}
