'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Plus, Search, Settings2 } from 'lucide-react';
import type { RoadmapRoleTemplate } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';
import { ColorMark } from '@/shared/ui/color-mark';

const SEARCH_THRESHOLD = 6;

function displayName(template: RoadmapRoleTemplate) {
  return template.isMock ? template.name.replace(/\s*\(демо\)\s*$/i, '') : template.name;
}

export function RoleCatalogPicker({ templates, catalogSize, loading, pendingId, onAdd }: {
  templates: RoadmapRoleTemplate[];
  catalogSize: number;
  loading: boolean;
  pendingId: string | null;
  onAdd: (templateId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = normalized ? templates.filter((template) => template.name.toLocaleLowerCase('ru-RU').includes(normalized)) : templates;
  const groups = [
    { id: 'catalog', label: 'Роли', items: filtered.filter((template) => !template.isMock) },
    { id: 'demo', label: 'Демо', items: filtered.filter((template) => template.isMock) },
  ].filter((group) => group.items.length);
  const grouped = groups.length > 1;

  return <div className="flex max-h-[min(420px,var(--radix-popover-content-available-height,420px))] flex-col">
    <div className="shrink-0 px-3 pb-2 pt-3">
      <p className="text-sm font-semibold text-foreground">Добавить роль</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Роль появится столбцом в плане проекта</p>
    </div>
    {templates.length > SEARCH_THRESHOLD ? <label className="relative mx-3 mb-2 block shrink-0">
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти роль" aria-label="Найти роль" className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
    </label> : null}
    <div className="min-h-0 flex-1 roadmap-scrollbar overflow-y-auto overscroll-contain border-t border-border px-1.5 py-1.5">
      {loading ? <p role="status" className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />Загружаем каталог…</p>
        : !templates.length ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">{catalogSize ? 'Все роли из каталога уже добавлены в проект.' : 'Каталог ролей пуст.'}</p>
          : !filtered.length ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>
            : groups.map((group) => <div key={group.id} role="group" aria-label={group.label}>
              {grouped ? <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
              {group.items.map((template) => {
                const pending = pendingId === template.id;
                return <button key={template.id} type="button" disabled={pendingId !== null} onClick={() => onAdd(template.id)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:cursor-default disabled:opacity-60">
                  <ColorMark color={template.color} size="md" />
                  <span className="min-w-0 flex-1 truncate">{displayName(template)}</span>
                  {template.isMock && !grouped ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}
                  {pending ? <LoaderCircle aria-hidden="true" className="size-3.5 text-muted-foreground motion-safe:animate-spin" /> : <Plus aria-hidden="true" className="size-3.5 text-muted-foreground/60 group-hover:text-foreground group-focus-visible:text-foreground" />}
                  <span className="sr-only">{pending ? 'Добавляем' : 'Добавить'}</span>
                </button>;
              })}
            </div>)}
    </div>
    <Link href={routes.roadmapAdminRoles} className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      <Settings2 aria-hidden="true" className="size-3.5" />{catalogSize ? 'Управлять каталогом ролей' : 'Создать роли в администрировании'}
    </Link>
  </div>;
}
