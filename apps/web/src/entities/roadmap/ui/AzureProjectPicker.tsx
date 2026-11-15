'use client';

import { useMemo } from 'react';
import { ArrowDownToLine, Check, Layers3 } from 'lucide-react';
import { type AzureProject } from '@/entities/roadmap/api/roadmapApi';
import { ALL_ROADMAP_PROJECTS } from '@/entities/roadmap/model/roadmap-project-selection';
import { SearchableSelect } from '@/shared/ui/searchable-select';

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
      description: 'Все импортированные проекты',
      group: 'Общий обзор',
      leading: <Layers3 className="h-4 w-4" />,
    }] : []),
    ...projects.filter((project) => project.imported).map((project) => ({
      value: project.id,
      label: project.name,
      description: project.planSynced === false ? 'Проект добавлен · задачи ещё не загружены' : 'Импортирован · план готов',
      group: 'В Roadmap',
      leading: <span className="text-emerald-600"><Check className="h-4 w-4" /></span>,
    })),
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
