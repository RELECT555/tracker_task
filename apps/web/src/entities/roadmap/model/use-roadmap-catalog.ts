'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roadmapApi, type AzureProject } from '../api/roadmapApi';

const EMPTY_PROJECTS: AzureProject[] = [];

export function useRoadmapCatalog(preferLocal: boolean) {
  // Keep the local ordering so a late Azure response cannot change the default.
  const localQuery = useQuery({ queryKey: ['roadmap', 'local-projects'], queryFn: roadmapApi.localProjects, enabled: preferLocal });
  const azureQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const azureProjects = azureQuery.data?.data ?? EMPTY_PROJECTS;
  const localProjects = preferLocal ? localQuery.data?.data : undefined;
  const projects = useMemo(() => {
    if (preferLocal && localQuery.isLoading) return EMPTY_PROJECTS;
    if (!localProjects?.length) return azureProjects;
    const localIds = new Set(localProjects.map((project) => project.id));
    const inAzure = new Map(azureProjects.map((project) => [project.id, project]));
    return [
      ...localProjects.map((project) => {
        const azureProject = inAzure.get(project.id);
        return azureProject && azureProject.roadmapId === project.roadmapId
          ? { ...azureProject, planSynced: project.planSynced }
          : project;
      }),
      ...azureProjects.filter((project) => !localIds.has(project.id)),
    ];
  }, [azureProjects, localProjects, localQuery.isLoading, preferLocal]);
  const loading = (preferLocal && localQuery.isLoading) || (!localProjects?.length && azureQuery.isLoading);
  return { projects, azureProjects, azureQuery, localQuery, loading };
}
