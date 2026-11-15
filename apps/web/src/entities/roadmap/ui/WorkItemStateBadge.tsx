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
  new: 'bg-slate-500/10 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300',
  active: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
  resolved: 'bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  done: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  removed: 'bg-rose-500/10 text-rose-700 line-through decoration-rose-700/40 dark:bg-rose-400/15 dark:text-rose-300',
  neutral: 'bg-muted text-foreground/70',
};

export function workItemStateTone(state: string): StateTone {
  const normalized = state.trim().toLowerCase();
  for (const tone of Object.keys(stateTones) as StateTone[]) {
    if (stateTones[tone].includes(normalized)) return tone;
  }
  return 'neutral';
}

export function WorkItemStateBadge({ state, className }: { state?: string | null; className?: string }) {
  if (!state?.trim()) return null;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-px text-[11px] leading-4 font-medium whitespace-nowrap', toneClasses[workItemStateTone(state)], className)}>
      {state}
    </span>
  );
}
