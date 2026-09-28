import { apiFetch } from '@/shared/api/client';
import { isRoadmapDemoMode, roadmapDemoApi } from './roadmapDemo';

export interface AzureProject {
  id: string;
  name: string;
  url?: string;
  imported: boolean;
  roadmapId?: string;
}

export interface RoadmapRole {
  id: string;
  projectId?: string | null;
  name: string;
  color: string;
  isMock?: boolean;
  defaultPersonExternalId?: string | null;
  defaultPersonName?: string | null;
  defaultPersonEmail?: string | null;
  defaultPersonIsMock?: boolean;
  members?: { personExternalId: string; personName: string; personEmail: string | null; personIsActive: boolean; personIsMock?: boolean }[];
}

export interface RoadmapPerson {
  id: string;
  name: string;
  email: string | null;
  isActive?: boolean;
  isMock?: boolean;
  roles?: (Pick<RoadmapRole, 'id' | 'name' | 'color'> & { projectName?: string | null })[];
}

export interface RoadmapPeriod {
  id?: string;
  monthKey?: string | null;
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

const liveRoadmapApi = {
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
  projects: () => apiFetch<{ data: AzureProject[]; source?: 'azure' | 'cache' }>('/roadmap/projects'),
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
  roles: (projectId: string) => apiFetch<RoadmapRole[]>(`/roadmap/roles?projectId=${encodeURIComponent(projectId)}`),
  adminPeople: () => apiFetch<RoadmapPerson[]>('/roadmap/admin/users'),
  syncAdminPeople: () => apiFetch<{ synced: number; ignored: number }>('/roadmap/admin/users/sync', { method: 'POST', body: '{}' }),
  adminRoles: (projectId: string) => apiFetch<RoadmapRole[]>(`/roadmap/admin/roles?projectId=${encodeURIComponent(projectId)}`),
  roleCatalog: () => apiFetch<Pick<RoadmapRole, 'id' | 'name' | 'color' | 'isMock'>[]>('/roadmap/admin/role-catalog'),
  createRoleTemplate: (name: string, color?: string) =>
    apiFetch<Pick<RoadmapRole, 'id' | 'name' | 'color' | 'isMock'>>('/roadmap/admin/role-catalog', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  addRoleFromCatalog: (projectId: string, templateId: string) =>
    apiFetch<RoadmapRole>('/roadmap/admin/roles/from-catalog', {
      method: 'POST',
      body: JSON.stringify({ projectId, templateId }),
    }),
  createRole: (projectId: string, name: string, color?: string) =>
    apiFetch<RoadmapRole>('/roadmap/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ projectId, name, color }),
    }),
  updateRole: (id: string, input: { name?: string; color?: string }) =>
    apiFetch<RoadmapRole>(`/roadmap/admin/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  setRoleMembers: (id: string, personExternalIds: string[]) =>
    apiFetch<RoadmapRole>(`/roadmap/admin/roles/${encodeURIComponent(id)}/members`, { method: 'PUT', body: JSON.stringify({ personExternalIds }) }),
  setRoleDefaultPerson: (id: string, personExternalId: string | null) =>
    apiFetch<RoadmapRole>(`/roadmap/admin/roles/${encodeURIComponent(id)}/default-person`, { method: 'PUT', body: JSON.stringify({ personExternalId }) }),
  deleteRole: (id: string) => apiFetch<{ deleted: boolean }>(`/roadmap/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveAllocation: (input: {
    allocationId?: string;
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
  saveAllocationQuarter: (allocationId: string, quarterKey: string, months: { monthKey: string; hours: number }[]) =>
    apiFetch<RoadmapPeriod[]>(`/roadmap/allocations/${encodeURIComponent(allocationId)}/quarters/${encodeURIComponent(quarterKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ months }),
    }),
};

export const roadmapApi = isRoadmapDemoMode()
  ? roadmapDemoApi as unknown as typeof liveRoadmapApi
  : liveRoadmapApi;
