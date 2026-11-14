import { apiFetch } from '@/shared/api/client';
import type { RoadmapProjectsResult } from './roadmapApi';

export type ProjectAccessRole = 'viewer' | 'planner';
export type ProjectAccess = { email: string; role: ProjectAccessRole };

const path = (projectId: string) => `/roadmap/admin/projects/${projectId}/access`;

export const projectAccessApi = {
  projects: () => apiFetch<RoadmapProjectsResult>('/roadmap/admin/projects'),
  list: (projectId: string) => apiFetch<ProjectAccess[]>(path(projectId)),
  set: (projectId: string, access: ProjectAccess) => apiFetch<ProjectAccess>(path(projectId), {
    method: 'PUT',
    body: JSON.stringify(access),
  }),
  revoke: (projectId: string, email: string) => apiFetch<{ revoked: true }>(`${path(projectId)}/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  }),
};
