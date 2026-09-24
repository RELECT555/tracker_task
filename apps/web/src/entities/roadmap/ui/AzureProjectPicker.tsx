'use client';

import { useMemo, useState } from 'react';
import { ArrowDownToLine, Check, ChevronDown, FolderKanban, Search } from 'lucide-react';
import { type AzureProject } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export function AzureProjectPicker({
  projects,
  value,
  onChange,
  disabled = false,
  placeholder = 'Выбрать проект Azure DevOps',
  className,
}: {
  projects: AzureProject[];
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedProject = projects.find((project) => project.id === value);
  const filteredProjects = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ru-RU');
    return projects.filter((project) => project.name.toLocaleLowerCase('ru-RU').includes(term));
  }, [projects, search]);
  const importedProjects = filteredProjects.filter((project) => project.imported);
  const availableProjects = filteredProjects.filter((project) => !project.imported);

  const selectProject = (project: AzureProject) => {
    onChange(project.id);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn('h-10 w-[min(360px,calc(100vw-2rem))] justify-between px-3 text-left', className)} disabled={disabled || !projects.length} aria-label="Выбрать проект Azure DevOps">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><FolderKanban className="h-3.5 w-3.5" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{selectedProject?.name ?? placeholder}</span><span className="block text-[10px] font-normal text-muted-foreground">{selectedProject ? selectedProject.imported ? 'План проекта' : 'Доступен для импорта' : 'Проекты Azure DevOps'}</span></span>
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0">
        <div className="border-b border-border p-2.5">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти проект…" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filteredProjects.length ? <>
            {importedProjects.length ? <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">В Roadmap</p> : null}
            {importedProjects.map((project) => <button key={project.id} type="button" onClick={() => selectProject(project)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted ${project.id === value ? 'bg-primary/5' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><Check className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{project.name}</span><span className="block text-[10px] text-muted-foreground">Импортирован · план готов</span></span>{project.id === value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </button>)}
            {availableProjects.length ? <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Доступны для импорта</p> : null}
            {availableProjects.map((project) => <button key={project.id} type="button" onClick={() => selectProject(project)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted ${project.id === value ? 'bg-primary/5' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ArrowDownToLine className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{project.name}</span><span className="block text-[10px] text-muted-foreground">Не импортирован</span></span>{project.id === value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </button>)}
          </> : <div className="px-3 py-8 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium text-foreground">Проект не найден</p><p className="mt-1 text-xs text-muted-foreground">Попробуйте изменить запрос.</p></div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
