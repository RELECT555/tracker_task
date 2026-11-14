'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AzureProject } from '../api/roadmapApi';

type ProjectSelection = {
  projectId: string;
  ready: boolean;
  selectProject: (projectId: string) => void;
};

const ProjectSelectionContext = createContext<ProjectSelection | null>(null);

export function RoadmapProjectSelection({ userId, children }: { userId: string; children: ReactNode }) {
  const storageKey = `roadmap:selected-project:${userId}`;
  const [storedProjectId, setStoredProjectId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStoredProjectId(window.localStorage.getItem(storageKey) ?? '');
    } catch {
      setStoredProjectId('');
    }
  }, [storageKey]);

  function selectProject(projectId: string) {
    setStoredProjectId(projectId);
    try {
      window.localStorage.setItem(storageKey, projectId);
    } catch {
      // The current Roadmap session still keeps the selection.
    }
  }

  return <ProjectSelectionContext.Provider value={{ projectId: storedProjectId ?? '', ready: storedProjectId !== null, selectProject }}>
    {children}
  </ProjectSelectionContext.Provider>;
}

export function useRoadmapProject(projects: AzureProject[]) {
  const selection = useContext(ProjectSelectionContext);
  if (!selection) throw new Error('RoadmapProjectSelection is required');

  const { projectId, ready, selectProject } = selection;
  const project = ready
    ? projects.find((item) => item.id === projectId)
      ?? projects.find((item) => item.imported && item.planSynced !== false)
      ?? projects.find((item) => item.imported)
      ?? projects[0]
    : undefined;

  return { project, ready, selectProject };
}
