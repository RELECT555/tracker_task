import { apiFetch } from '@/shared/api/client';

export interface AzureProject {
  id: string;
  name: string;
  url?: string;
  imported: boolean;
  roadmapId?: string;
}

export interface RoadmapRole {
  id: string;
  name: string;
  color: string;
  members?: { personExternalId: string; personName: string; personEmail: string | null; personIsActive: boolean }[];
}

export interface RoadmapPerson {
  id: string;
  name: string;
  email: string | null;
  isActive?: boolean;
  roles?: Pick<RoadmapRole, 'id' | 'name' | 'color'>[];
}

export interface RoadmapPeriod {
  id?: string;
  label: string;
  startsAt: string;
  endsAt: string;
  hours: number | string;
}

export interface RoadmapAllocation {
  id: string;
  roleId: string;
  personExternalId: string;
  personName: string;
  personEmail: string | null;
  estimatedHours: number | string;
  role: RoadmapRole;
  periods: RoadmapPeriod[];
}

export interface RoadmapWorkItem {
  id: string;
  externalId: string;
  parentExternalId: string | null;
  type: string;
  title: string;
  state: string | null;
  url: string | null;
  allocations: RoadmapAllocation[];
}

export interface RoadmapProjectPlan {
  id: string;
  externalId: string;
  name: string;
  url: string | null;
  syncedAt: string | null;
  workItems: RoadmapWorkItem[];
  roles: RoadmapRole[];
}

export interface RoadmapIntegrationSettings {
  provider: 'azure-devops';
  organizationUrl: string;
  configured: boolean;
  patConfigured: boolean;
  source: 'settings' | 'environment' | 'unconfigured';
  encryptionKeyConfigured: boolean;
}

export const roadmapApi = {
  connection: () =>
    apiFetch<{ provider: string; configured: boolean; organizationUrl: string }>(
      '/roadmap/connection',
    ),
  integrationSettings: () =>
    apiFetch<RoadmapIntegrationSettings>('/roadmap/settings/azure-devops'),
  saveIntegrationSettings: (input: { organizationUrl: string; pat?: string }) =>
    apiFetch<RoadmapIntegrationSettings>('/roadmap/settings/azure-devops', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  testIntegrationConnection: (input: { organizationUrl?: string; pat?: string }) =>
    apiFetch<{ ok: true; projectCount: number }>('/roadmap/settings/azure-devops/test', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  projects: () => apiFetch<{ data: AzureProject[] }>('/roadmap/projects'),
  syncProject: (project: AzureProject) =>
    apiFetch<{ projectId: string; importedWorkItems: number }>(
      `/roadmap/projects/${encodeURIComponent(project.id)}/sync`,
      {
        method: 'POST',
        body: JSON.stringify({ name: project.name, url: project.url }),
      },
    ),
  plan: (projectId: string) =>
    apiFetch<RoadmapProjectPlan>(`/roadmap/projects/${projectId}/plan`),
  people: () => apiFetch<{ data: RoadmapPerson[] }>('/roadmap/people'),
  roles: () => apiFetch<RoadmapRole[]>('/roadmap/roles'),
  adminPeople: () => apiFetch<RoadmapPerson[]>('/roadmap/admin/users'),
  syncAdminPeople: () => apiFetch<{ synced: number }>('/roadmap/admin/users/sync', { method: 'POST', body: '{}' }),
  adminRoles: () => apiFetch<RoadmapRole[]>('/roadmap/admin/roles'),
  createRole: (name: string, color?: string) =>
    apiFetch<RoadmapRole>('/roadmap/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  updateRole: (id: string, input: { name?: string; color?: string }) =>
    apiFetch<RoadmapRole>(`/roadmap/admin/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  setRoleMembers: (id: string, personExternalIds: string[]) =>
    apiFetch<RoadmapRole>(`/roadmap/admin/roles/${encodeURIComponent(id)}/members`, { method: 'PUT', body: JSON.stringify({ personExternalIds }) }),
  deleteRole: (id: string) => apiFetch<{ deleted: boolean }>(`/roadmap/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveAllocation: (input: {
    workItemId: string;
    roleId: string;
    personExternalId: string;
    personName: string;
    personEmail?: string | null;
    estimatedHours: number;
    periods: Omit<RoadmapPeriod, 'id'>[];
  }) =>
    apiFetch<RoadmapAllocation>('/roadmap/allocations', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
