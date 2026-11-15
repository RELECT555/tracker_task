'use client';

import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';

const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/**
 * A role's hours on a feature: type a number and it goes straight to the role's field of the feature
 * in Azure DevOps. People assigned to the role are kept in Roadmap only; their hours follow the total.
 */
export function RoleHoursCell({ workItemId, roleId, roleName, quarterKey, hours, estimateFromAzure }: {
  workItemId: string;
  roleId: string;
  roleName: string;
  /** Quarter whose assignments are re-split when the role has people. */
  quarterKey: string;
  hours: number;
  /** The shown value is the card's Azure DevOps estimate rather than a plan. */
  estimateFromAzure: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: number) => roadmapApi.setRoleHours(workItemId, roleId, value, quarterKey),
    // Returned, so the typed value stays on screen until the refreshed plan has arrived.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
  });
  const shown = save.isPending && typeof save.variables === 'number' ? save.variables : hours;

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim().replace(',', '.');
    setDraft(null);
    if (!text) return;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value === hours) return;
    save.mutate(Math.round(value * 100) / 100);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
    }
  };

  if (draft !== null) {
    return <input
      autoFocus
      aria-label={`Часы роли «${roleName}»`}
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="h-7 w-20 rounded-md border border-input bg-field px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    />;
  }
  return <>
    {save.error ? <span role="alert" className="mr-2 line-clamp-4 max-w-[14rem] break-words text-right text-[11px] leading-4 text-destructive" title={save.error.message}>{save.error.message}</span> : null}
    <button
      type="button"
      disabled={save.isPending}
      onClick={() => setDraft(shown ? String(shown) : '')}
      title={estimateFromAzure ? 'Оценка Azure DevOps на всю карточку. Нажмите, чтобы изменить часы роли в Azure' : 'Нажмите и впишите часы — они запишутся в поле роли в Azure DevOps'}
      aria-label={`Часы роли «${roleName}»: ${shown ? hoursFormat.format(shown) : 'не заданы'}. Изменить`}
      className={cn(
        'inline-flex h-7 min-w-12 items-center justify-end gap-1 rounded-md px-2 text-sm tabular-nums transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60',
        shown ? 'font-medium text-foreground' : 'text-muted-foreground/40',
        estimateFromAzure && shown ? 'underline decoration-muted-foreground/50 decoration-dotted underline-offset-4' : null,
      )}
    >
      {save.isPending ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
      {shown ? hoursFormat.format(shown) : '—'}
    </button>
  </>;
}
