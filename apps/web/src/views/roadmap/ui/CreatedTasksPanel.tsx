'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, ListChecks, X } from 'lucide-react';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { Button } from '@/shared/ui/button';

export interface CreatedTaskItem {
  id: string;
  externalId: string;
  type: string;
  title: string;
  url?: string | null;
}

export function CreatedTasksPanel({ items }: { items: CreatedTaskItem[] }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const closePanel = () => dialog.current?.close();

  return <>
    <Button ref={trigger} type="button" variant="outline" size="sm" className="h-9 gap-2" aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); }}>
      <ListChecks aria-hidden="true" className="size-4" />Созданные задачи
      <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">{items.length}</span>
    </Button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="table-settings-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md overflow-hidden border-l border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-transparent"
      onClose={() => { setOpen(false); trigger.current?.focus(); }}
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePanel();
      }}
    >
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <header className="flex shrink-0 items-start justify-between gap-3 px-6 pb-5 pt-6">
          <div>
            <h2 id={`${id}-title`} className="text-balance text-lg font-semibold">Задачи из Roadmap</h2>
            <p id={`${id}-description`} className="mt-1.5 text-xs text-muted-foreground">Создано в Azure DevOps из плана · {items.length}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 size-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Закрыть список задач" onClick={closePanel}><X aria-hidden="true" className="size-4" /></Button>
        </header>
        {open ? <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
          {items.map((item) => {
            const content = <>
              <AzureWorkItemIcon type={item.type} className="mt-0.5 shrink-0" />
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">#{item.externalId}</span>
              <span className="min-w-0 flex-1 break-words">{item.title}</span>
              {item.url ? <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover/item:text-primary" /> : null}
            </>;
            return <li key={item.id}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="group/item flex items-start gap-2.5 px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/60 hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">{content}</a>
              ) : <div className="flex items-start gap-2.5 px-6 py-3 text-sm">{content}</div>}
            </li>;
          })}
        </ul> : null}
      </div>
    </dialog>
  </>;
}
