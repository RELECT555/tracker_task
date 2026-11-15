'use client';

import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { SlidersHorizontal, X } from 'lucide-react';
import type { RoadmapTablePreferences } from '@tracker/shared';
import { Button } from '@/shared/ui/button';
import './table-settings-panel.css';

export interface TableAppearanceSettingsProps {
  preferences: RoadmapTablePreferences;
  onChange: (patch: Partial<RoadmapTablePreferences>) => void;
  onReset: () => void;
  status: 'loading' | 'saving' | 'saved' | 'error';
  onRetry: () => void;
  disabled?: boolean;
  hasCustomWidths?: boolean;
  onResetWidths?: () => void;
}

const TableAppearancePanel = dynamic(() => import('./TableAppearancePanel').then((module) => module.TableAppearancePanel), {
  loading: () => <p role="status" className="px-6 py-4 text-sm text-muted-foreground">Загружаем настройки таблицы…</p>,
});

export function TableAppearanceSettings(props: TableAppearanceSettingsProps) {
  const { status, disabled } = props;
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

  const openPanel = () => {
    dialog.current?.showModal();
    setOpen(true);
  };
  const closePanel = () => dialog.current?.close();
  const errorMessage = disabled ? 'Не удалось загрузить настройки.' : 'Не удалось сохранить настройки.';

  return <>
    <Button ref={trigger} type="button" variant="outline" size="sm" className="h-8 gap-2" aria-haspopup="dialog" aria-expanded={open} aria-describedby={status === 'error' ? `${id}-error` : undefined} title={status === 'error' ? `${errorMessage} Откройте панель, чтобы повторить.` : undefined} onClick={openPanel}>
      <SlidersHorizontal aria-hidden="true" className="size-4" />Вид таблицы
      {status === 'error' ? <span aria-hidden="true" className="size-1.5 rounded-full bg-destructive" /> : null}
    </Button>
    {status === 'error' ? <span id={`${id}-error`} className="sr-only">{errorMessage} Откройте панель, чтобы повторить.</span> : null}
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="roadmap-sheet table-settings-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md overflow-hidden border-l border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-transparent"
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
          <div><h2 id={`${id}-title`} className="text-balance text-lg font-semibold">Вид таблицы</h2><p id={`${id}-description`} className="mt-1.5 text-xs text-muted-foreground">Только для вас · Во всех проектах</p></div>
          <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 size-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Закрыть настройки таблицы" onClick={closePanel}><X aria-hidden="true" className="size-4" /></Button>
        </header>
        {open ? <TableAppearancePanel {...props} id={id} /> : null}
      </div>
    </dialog>
  </>;
}
