'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AzureProject } from '../api/roadmapApi';

export const ALL_ROADMAP_PROJECTS = '__all__';

export function resolveRoadmapProject(projects: AzureProject[], projectId: string) {
  return projects.find((project) => project.id === projectId)
    ?? projects.find((project) => project.imported && project.planSynced !== false)
    ?? projects.find((project) => project.imported)
    ?? projects[0];
}

type SavedProject = {
  projectId: string;
  roadmapId?: string;
};

type ProjectSelection = {
  savedProject: SavedProject;
  ready: boolean;
  saveProject: (project: SavedProject, refreshLocalId?: boolean) => void;
};

const emptySelection: SavedProject = { projectId: '' };
const ProjectSelectionContext = createContext<ProjectSelection | null>(null);

function readSavedProject(value: string | null): SavedProject {
  if (!value) return emptySelection;
  // Older versions stored just the external project ID or the all-projects marker.
  if (!value.startsWith('{')) return { projectId: value };

  const stored = JSON.parse(value);
  if (typeof stored.projectId !== 'string') return emptySelection;
  return {
    projectId: stored.projectId,
    roadmapId: typeof stored.roadmapId === 'string' ? stored.roadmapId : undefined,
  };
}

export function RoadmapProjectSelection({ userId, children }: { userId: string; children: ReactNode }) {
  const storageKey = `roadmap:selected-project:${userId}`;
  const [storedProject, setStoredProject] = useState<SavedProject | null>(null);

  useEffect(() => {
    try {
      setStoredProject(readSavedProject(window.localStorage.getItem(storageKey)));
    } catch {
      setStoredProject(emptySelection);
    }
  }, [storageKey]);

  const saveProject = useCallback((project: SavedProject, refreshLocalId = false) => {
    setStoredProject((current) => refreshLocalId && current?.projectId !== project.projectId ? current : project);
    try {
      const storage = window.localStorage;
      if (refreshLocalId && readSavedProject(storage.getItem(storageKey)).projectId !== project.projectId) return;
      storage.setItem(storageKey, JSON.stringify(project));
    } catch {
      // The current Roadmap session still keeps the selection.
    }
  }, [storageKey]);

  return <ProjectSelectionContext.Provider value={{ savedProject: storedProject ?? emptySelection, ready: storedProject !== null, saveProject }}>
    {children}
  </ProjectSelectionContext.Provider>;
}

export function useRoadmapProject(projects: AzureProject[], { allowAll = false, catalogLoading = false }: {
  allowAll?: boolean;
  catalogLoading?: boolean;
} = {}) {
  const selection = useContext(ProjectSelectionContext);
  if (!selection) throw new Error('RoadmapProjectSelection is required');

  const { savedProject, ready, saveProject } = selection;
  const isAllProjects = ready && allowAll && savedProject.projectId === ALL_ROADMAP_PROJECTS;
  const waitingForSavedProject = catalogLoading && Boolean(savedProject.projectId) && savedProject.projectId !== ALL_ROADMAP_PROJECTS
    && !projects.some((item) => item.id === savedProject.projectId);
  const project = ready && !isAllProjects && !waitingForSavedProject
    ? resolveRoadmapProject(projects, savedProject.projectId)
    : undefined;
  const matchingProject = project?.id === savedProject.projectId ? project : undefined;

  useEffect(() => {
    if (matchingProject && matchingProject.roadmapId !== savedProject.roadmapId) {
      saveProject({ projectId: matchingProject.id, roadmapId: matchingProject.roadmapId }, true);
    }
  }, [matchingProject, savedProject.roadmapId, saveProject]);

  function selectProject(projectId: string) {
    const roadmapId = projects.find((item) => item.id === projectId)?.roadmapId;
    saveProject({ projectId, roadmapId });
  }

  return { project, savedProject, ready, selectProject, isAllProjects };
}
