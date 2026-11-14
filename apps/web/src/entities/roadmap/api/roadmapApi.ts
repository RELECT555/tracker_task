import { apiFetch } from '@/shared/api/client';
import type { SyncSettingsV2 } from '@tracker/shared';
import { isRoadmapDemoMode, roadmapDemoApi } from './roadmapDemo';

export interface AzureProject {
  id: string;
  name: string;
  url?: string;
  imported: boolean;
  planSynced?: boolean;
  roadmapId?: string;
}

export interface RoadmapProjectSyncResult {
  projectId: string;
  importedWorkItems: number;
  importedRoles?: number;
  roleSyncWarning?: string;
}

export interface RoadmapProjectsResult {
  data: AzureProject[];
  source?: 'azure' | 'cache' | 'local';
  azureError?: 'access-denied' | 'unavailable';
}

export interface RoadmapRole {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  name: string;
  color: string;
  isMock?: boolean;
  azureEstimateField?: string | null;
  defaultPersonExternalId?: string | null;
  defaultPersonName?: string | null;
  defaultPersonEmail?: string | null;
  defaultPersonIsMock?: boolean;
  members?: { personExternalId: string; personName: string; personEmail: string | null; personIsActive: boolean; personIsMock?: boolean }[];
}

export type RoadmapRoleTemplate = Pick<RoadmapRole, 'id' | 'name' | 'color' | 'isMock' | 'azureEstimateField'>;
export type RoadmapRoleAssignment = { personExternalId?: string | null; personExternalIds?: string[] };

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
  /** Planning quarter in `YYYY-Qn` format; the estimate is the hours for this quarter. */
  quarterKey: string;
  estimatedHours: number | string;
  role: RoadmapRole;
  periods: RoadmapPeriod[];
  /** Azure DevOps Task that mirrors this allocation (plan is written there, fact is read from it). */
  azureTaskId?: string | null;
  azureTaskUrl?: string | null;
  azureTaskState?: string | null;
  azureSyncStatus?: RoadmapAzureSyncStatus | null;
  azureSyncError?: string | null;
  azureSyncedAt?: string | null;
  /** Completed Work logged on the linked Azure DevOps Task. */
  actualHours?: number | string | null;
}

export type RoadmapAzureSyncStatus = 'pending' | 'sending' | 'synced' | 'error' | 'conflict' | 'skipped';

export interface RoadmapWorkItem {
  id: string;
  externalId: string;
  parentExternalId: string | null;
  type: string;
  title: string;
  state: string | null;
  url: string | null;
  actualHours: number | string | null;
  azureCustomFields: Record<string, unknown> | null;
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
  canEditPlan?: boolean;
  azure?: { writeBackEnabled: boolean; mode?: RoadmapWriteBackMode; canPush?: boolean; createdTaskIds?: string[] };
}

export interface CreateAzureWorkItemInput {
  requestId: string;
  type: 'Epic' | 'Feature' | 'Task';
  title: string;
  description?: string;
  parentExternalId?: string;
  personExternalId?: string;
}

export interface CreatedAzureWorkItem {
  projectId: string;
  externalId: string;
  url: string;
  title: string;
  type: CreateAzureWorkItemInput['type'];
}

export interface RoadmapMonthlyFact {
  workItems: Record<string, number>;
  allocations: Record<string, number>;
  totalHours: number;
}

export function getRoadmapMonthlyFact(projectId: string, monthKey: string, signal?: AbortSignal) {
  return apiFetch<RoadmapMonthlyFact>(`/roadmap/projects/${encodeURIComponent(projectId)}/fact?monthKey=${encodeURIComponent(monthKey)}`, { signal });
}

export interface RoadmapIntegrationSettings {
  provider: 'azure-devops';
  organizationUrl: string;
  configured: boolean;
  patConfigured: boolean;
  source: 'settings' | 'environment' | 'unconfigured';
  encryptionKeyConfigured: boolean;
  /** Allocations are written to Azure DevOps as work items. */
  writeBackEnabled: boolean;
  writeBack: RoadmapWriteBackSettings;
  webhookConfigured: boolean;
}

/** off: nothing is written; manual: sent by the "Send to Azure" button; auto: sent on every save. */
export type RoadmapWriteBackMode = 'off' | 'manual' | 'auto';

export interface RoadmapWriteBackSettings {
  mode: RoadmapWriteBackMode;
  workItemType: string;
  /** Tokens: {role} {title} {quarter} {quarterKey} {person} {id}. */
  titleTemplate: string;
  tagsTemplate: string;
  fields: {
    assignedTo: boolean;
    originalEstimate: boolean;
    remainingWork: boolean;
    iteration: boolean;
    areaPath: boolean;
    description: boolean;
  };
  remainingWorkPolicy: 'recalculate' | 'create-only';
  /** Roadmap project ids allowed for write-back; null = all imported projects. */
  projectIds: string[] | null;
}

export interface RoadmapAzurePushPreview {
  mode: RoadmapWriteBackMode;
  workItemType: string;
  projectAllowed: boolean;
  counts: { create: number; update: number; skip: number };
  items: {
    allocationId: string;
    workItemExternalId: string;
    workItemTitle: string;
    roleName: string;
    personName: string;
    assignee: string | null;
    quarterKey: string;
    estimatedHours: number;
    pushedHours: number | null;
    action: 'create' | 'update' | 'skip';
    skipReason: string | null;
    taskTitle: string | null;
    azureTaskId: string | null;
    status: RoadmapAzureSyncStatus | null;
    error: string | null;
  }[];
}

export interface RoadmapWriteBackOverview {
  settings: RoadmapWriteBackSettings;
  projects: {
    id: string;
    externalId: string;
    name: string;
    url: string | null;
    syncedAt: string | null;
    enabled: boolean;
    total: number;
    counts: { notSent: number; pending: number; sending: number; synced: number; error: number; conflict: number; skipped: number };
    lastPushedAt: string | null;
    lastCheckAt: string | null;
    lastCheckStatus: RoadmapReadinessCheck['status'] | null;
    lastCheck: RoadmapReadinessCheck[] | null;
    lastWebhookAt: string | null;
  }[];
  errors: {
    allocationId: string;
    projectId: string;
    workItemExternalId: string;
    workItemTitle: string;
    roleName: string;
    personName: string;
    quarterKey: string;
    error: string | null;
    updatedAt: string;
  }[];
}

export interface RoadmapReadinessCheck {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export type RoadmapWorkItemType = { name: string; referenceName: string; icon?: string; color?: string };
export type RoadmapAzureField = { referenceName: string; name: string; type: string; isCustom: boolean; readOnly: boolean; isIdentity: boolean; isPicklist: boolean; alwaysRequired: boolean; allowedValues?: string[]; defaultValue?: unknown; helpText?: string };
export type RoadmapAzureState = { name: string; category?: string; color?: string };

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
  saveWriteBackSettings: ({ mode, workItemType, titleTemplate, tagsTemplate, fields, remainingWorkPolicy, projectIds }: RoadmapWriteBackSettings) =>
    apiFetch<RoadmapIntegrationSettings>('/roadmap/settings/azure-devops/write-back', {
      method: 'PUT',
      body: JSON.stringify({ mode, workItemType, titleTemplate, tagsTemplate, fields, remainingWorkPolicy, projectIds }),
    }),
  writeBackOverview: () => apiFetch<RoadmapWriteBackOverview>('/roadmap/settings/azure-devops/write-back/overview'),
  syncSettingsV2: () => apiFetch<SyncSettingsV2>('/roadmap/settings/azure-devops/write-back/v2'),
  saveSyncSettingsV2: (settings: SyncSettingsV2) => apiFetch<SyncSettingsV2>('/roadmap/settings/azure-devops/write-back/v2', { method: 'PUT', body: JSON.stringify(settings) }),
  workItemTypes: (projectId: string) => apiFetch<RoadmapWorkItemType[]>(`/roadmap/settings/azure-devops/work-item-types?projectId=${encodeURIComponent(projectId)}`),
  azureFields: (projectId: string, workItemType: string, refresh = false) => apiFetch<RoadmapAzureField[]>(`/roadmap/settings/azure-devops/fields?projectId=${encodeURIComponent(projectId)}&workItemType=${encodeURIComponent(workItemType)}${refresh ? '&refresh=1' : ''}`),
  azureStates: (projectId: string, workItemType: string) => apiFetch<RoadmapAzureState[]>(`/roadmap/settings/azure-devops/states?projectId=${encodeURIComponent(projectId)}&workItemType=${encodeURIComponent(workItemType)}`),
  checkWriteBack: (projectId: string) =>
    apiFetch<{ checks: RoadmapReadinessCheck[] }>(`/roadmap/settings/azure-devops/write-back/check/${encodeURIComponent(projectId)}`, { method: 'POST', body: '{}' }),
  webhookSecret: () => apiFetch<{ secret: string }>('/roadmap/settings/azure-devops/webhook-secret'),
  rotateWebhookSecret: () =>
    apiFetch<{ secret: string }>('/roadmap/settings/azure-devops/webhook-secret/rotate', { method: 'POST', body: '{}' }),
  projects: () => apiFetch<RoadmapProjectsResult>('/roadmap/projects'),
  syncProject: (project: AzureProject) =>
    apiFetch<RoadmapProjectSyncResult>(
      `/roadmap/projects/${encodeURIComponent(project.id)}/sync`,
      {
        method: 'POST',
        body: JSON.stringify({ name: project.name, url: project.url }),
      },
    ),
  plan: (projectId: string) =>
    apiFetch<RoadmapProjectPlan>(`/roadmap/projects/${projectId}/plan`),
  createWorkItem: (externalProjectId: string, input: CreateAzureWorkItemInput) =>
    apiFetch<CreatedAzureWorkItem>(`/roadmap/azure-projects/${encodeURIComponent(externalProjectId)}/work-items`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  previewAzurePush: (projectId: string) =>
    apiFetch<RoadmapAzurePushPreview>(`/roadmap/projects/${encodeURIComponent(projectId)}/azure-push/preview`),
  pushProjectToAzure: (projectId: string, allocationIds?: string[]) =>
    apiFetch<{ queued: number }>(`/roadmap/projects/${encodeURIComponent(projectId)}/azure-push`, { method: 'POST', body: JSON.stringify({ allocationIds }) }),
  pushAllocationToAzure: (allocationId: string) =>
    apiFetch<{ queued: number }>(`/roadmap/allocations/${encodeURIComponent(allocationId)}/azure-push`, { method: 'POST', body: '{}' }),
  people: () => apiFetch<{ data: RoadmapPerson[] }>('/roadmap/people'),
  roles: (projectId: string) => apiFetch<RoadmapRole[]>(`/roadmap/roles?projectId=${encodeURIComponent(projectId)}`),
  adminPeople: () => apiFetch<RoadmapPerson[]>('/roadmap/admin/users'),
  adminPersonAvatar: (id: string, signal?: AbortSignal) =>
    apiFetch<{ avatar: string | null }>(`/roadmap/admin/users/${encodeURIComponent(id)}/avatar`, { signal }),
  syncAdminPeople: () => apiFetch<{ synced: number; ignored: number }>('/roadmap/admin/users/sync', { method: 'POST', body: '{}' }),
  adminRoles: (projectId?: string) => apiFetch<RoadmapRole[]>(`/roadmap/admin/roles${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  roleCatalog: () => apiFetch<RoadmapRoleTemplate[]>('/roadmap/admin/role-catalog'),
  createRoleTemplate: (name: string, color?: string, assignment?: RoadmapRoleAssignment & { projectId: string }) =>
    apiFetch<RoadmapRoleTemplate>('/roadmap/admin/role-catalog', {
      method: 'POST',
      body: JSON.stringify({ name, color, ...assignment }),
    }),
  addRoleFromCatalog: (projectId: string, templateId: string, assignment: RoadmapRoleAssignment = {}) =>
    apiFetch<RoadmapRole>('/roadmap/admin/roles/from-catalog', {
      method: 'POST',
      body: JSON.stringify({ projectId, templateId, ...assignment }),
    }),
  createRole: (projectId: string, name: string, color?: string) =>
    apiFetch<RoadmapRole>('/roadmap/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ projectId, name, color }),
    }),
  updateRole: (id: string, input: { name?: string; color?: string } & RoadmapRoleAssignment) =>
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
    quarterKey: string;
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
  rebalanceAllocations: (allocationIds: string[]) =>
    apiFetch<{ updated: number }>('/roadmap/allocations/rebalance', {
      method: 'PUT',
      body: JSON.stringify({ allocationIds }),
    }),
};

export const roadmapApi = isRoadmapDemoMode()
  ? roadmapDemoApi as unknown as typeof liveRoadmapApi
  : liveRoadmapApi;
