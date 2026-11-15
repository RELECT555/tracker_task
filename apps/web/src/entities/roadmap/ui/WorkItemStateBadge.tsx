import { cn } from '@/shared/lib/utils';

type StateTone = 'new' | 'active' | 'resolved' | 'done' | 'removed' | 'neutral';

// Groups Azure DevOps states (stock and common custom ones) by meaning, not by exact name.
const stateTones: Record<StateTone, readonly string[]> = {
  new: ['new', 'proposed', 'to do', 'todo', 'backlog', 'approved', 'design', 'новый', 'новая', 'к выполнению'],
  active: ['active', 'in progress', 'committed', 'doing', 'in development', 'в работе', 'активна', 'активный'],
  resolved: ['resolved', 'review', 'in review', 'testing', 'in testing', 'на проверке', 'тестирование', 'решена'],
  done: ['closed', 'done', 'completed', 'released', 'закрыта', 'закрыт', 'готово', 'выполнена', 'опубликован'],
  removed: ['removed', 'cut', 'cancelled', 'canceled', 'rejected', 'удалена', 'отменена'],
  neutral: [],
};

const toneClasses: Record<StateTone, string> = {
  new: 'bg-slate-500/5 text-slate-600 ring-slate-500/25 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/30',
  active: 'bg-sky-500/5 text-sky-700 ring-sky-500/30 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30',
  resolved: 'bg-amber-500/5 text-amber-800 ring-amber-500/35 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30',
  done: 'bg-emerald-500/5 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  removed: 'bg-rose-500/5 text-rose-700 ring-rose-500/30 line-through decoration-rose-700/40 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30',
  neutral: 'bg-muted/50 text-foreground/70 ring-border',
};

const dotClasses: Record<StateTone, string> = {
  new: 'bg-slate-400',
  active: 'bg-sky-500',
  resolved: 'bg-amber-500',
  done: 'bg-emerald-500',
  removed: 'bg-rose-500',
  neutral: 'bg-muted-foreground/60',
};

export function workItemStateTone(state: string): StateTone {
  const normalized = state.trim().toLowerCase();
  for (const tone of Object.keys(stateTones) as StateTone[]) {
    if (stateTones[tone].includes(normalized)) return tone;
  }
  return 'neutral';
}

/** `dot` is the quieter form for dense child rows: a colored dot and plain text instead of a pill. */
export function WorkItemStateBadge({ state, className, variant = 'pill' }: { state?: string | null; className?: string; variant?: 'pill' | 'dot' }) {
  if (!state?.trim()) return null;
  if (variant === 'dot') {
    const tone = workItemStateTone(state);
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[11px] leading-4 whitespace-nowrap text-muted-foreground', tone === 'removed' && 'line-through decoration-rose-700/40', className)}>
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', dotClasses[tone])} />
        {state}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-px text-[10.5px] leading-4 font-medium whitespace-nowrap ring-1 ring-inset', toneClasses[workItemStateTone(state)], className)}>
      {state}
    </span>
  );
}
