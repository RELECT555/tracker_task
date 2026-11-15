'use client';

import { useMemo } from 'react';
import { ArrowDownToLine, Layers3 } from 'lucide-react';
import { type AzureProject } from '@/entities/roadmap/api/roadmapApi';
import { ALL_ROADMAP_PROJECTS } from '@/entities/roadmap/model/roadmap-project-selection';
import { SearchableSelect } from '@/shared/ui/searchable-select';

function projectMonogram(name: string) {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2);
  return letters.toLocaleUpperCase('ru-RU');
}

export function AzureProjectPicker({
  projects,
  value,
  onChange,
  disabled = false,
  includeAllProjects = false,
  placeholder = 'Выбрать проект Azure DevOps',
  className,
}: {
  projects: AzureProject[];
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  includeAllProjects?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const options = useMemo(() => [
    ...(includeAllProjects ? [{
      value: ALL_ROADMAP_PROJECTS,
      label: 'Все проекты',
      description: 'Сводка по всем импортированным',
      triggerDescription: null,
      group: 'Общий обзор',
      leading: <Layers3 className="h-4 w-4" />,
    }] : []),
    ...projects.filter((project) => project.imported).map((project) => {
      const pending = project.planSynced === false;
      return {
        value: project.id,
        label: project.name,
        description: pending ? 'Задачи ещё не загружены' : 'План готов',
        // The ready state is the norm, so the closed picker only speaks up when something needs attention.
        triggerDescription: pending ? 'Задачи ещё не загружены' : null,
        descriptionTone: pending ? 'warning' as const : 'muted' as const,
        group: 'В Roadmap',
        leading: <span aria-hidden="true" className="text-[11px] font-semibold tracking-tight">{projectMonogram(project.name)}</span>,
      };
    }),
    ...projects.filter((project) => !project.imported).map((project) => ({
      value: project.id,
      label: project.name,
      description: 'Не импортирован',
      group: 'Доступны для импорта',
      leading: <ArrowDownToLine className="h-4 w-4" />,
    })),
  ], [projects, includeAllProjects]);

  return <SearchableSelect
    value={value}
    onChange={onChange}
    options={options}
    disabled={disabled || !projects.length}
    placeholder={placeholder}
    searchPlaceholder="Найти проект…"
    emptyLabel="Проект не найден. Попробуйте изменить запрос."
    ariaLabel="Выбрать проект Azure DevOps"
    className={className ?? 'h-10 w-[min(360px,calc(100vw-2rem))]'}
  />;
}
