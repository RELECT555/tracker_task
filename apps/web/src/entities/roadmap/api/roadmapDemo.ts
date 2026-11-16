import type {
  AzureProject,
  CreatedAzureWorkItem,
  RoadmapAllocation,
  RoadmapAzurePushPreview,
  RoadmapReadinessCheck,
  RoadmapWriteBackOverview,
  RoadmapWriteBackSettings,
  RoadmapIntegrationSettings,
  RoadmapPeriod,
  RoadmapPerson,
  RoadmapProjectsResult,
  RoadmapProjectPlan,
  RoadmapProjectSyncResult,
  RoadmapRole,
  RoadmapRoleAssignment,
  RoadmapRoleTemplate,
  RoadmapAzureField,
  RoadmapAzureState,
  RoadmapWorkItemType,
} from './roadmapApi';
import type { RoadmapPortfolio, RoadmapPortfolioInput, SyncSettingsV2 } from '@tracker/shared';
import { apiFetch } from '@/shared/api/client';

type DemoMethod =
  | 'connection' | 'integrationSettings' | 'saveIntegrationSettings' | 'testIntegrationConnection'
  | 'projects' | 'projectSummaries' | 'syncProject' | 'plan' | 'people' | 'roles' | 'adminPeople' | 'syncAdminPeople'
  | 'adminRoles' | 'roleCatalog' | 'createRoleTemplate' | 'deleteRoleTemplate' | 'addRoleFromCatalog' | 'createRole'
  | 'updateRole' | 'setRoleMembers' | 'setRoleDefaultPerson' | 'deleteRole' | 'saveAllocation'
  | 'saveAllocationQuarter' | 'rebalanceAllocations' | 'saveWriteBackSettings' | 'writeBackOverview' | 'checkWriteBack'
  | 'syncSettingsV2' | 'saveSyncSettingsV2' | 'workItemTypes' | 'azureFields' | 'azureStates'
  | 'webhookSecret' | 'rotateWebhookSecret' | 'previewAzurePush' | 'pushProjectToAzure' | 'pushAllocationToAzure';

async function call<T>(method: DemoMethod, args: unknown[] = [], signal?: AbortSignal): Promise<T> {
  const response = await apiFetch<{ data: T }>('/api/roadmap-demo', {
    method: 'POST',
    body: JSON.stringify({ method, args }),
    signal,
  }, '');
  return response.data;
}

export function isRoadmapDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_ROADMAP_DEMO === 'true';
}

export const roadmapDemoApi = {
  connection: () => call<{ provider: string; configured: boolean; organizationUrl: string }>('connection'),
  integrationSettings: () => call<RoadmapIntegrationSettings>('integrationSettings'),
  saveIntegrationSettings: (input: { organizationUrl: string; pat?: string }) => call<RoadmapIntegrationSettings>('saveIntegrationSettings', [input]),
  testIntegrationConnection: (input: { organizationUrl?: string; pat?: string }) => call<{ ok: true; projectCount: number }>('testIntegrationConnection', [input]),
  saveWriteBackSettings: (settings: RoadmapWriteBackSettings) => call<RoadmapIntegrationSettings>('saveWriteBackSettings', [settings]),
  writeBackOverview: () => call<RoadmapWriteBackOverview>('writeBackOverview'),
  checkWriteBack: (projectId: string) => call<{ checks: RoadmapReadinessCheck[] }>('checkWriteBack', [projectId]),
  syncSettingsV2: () => call<SyncSettingsV2>('syncSettingsV2'),
  saveSyncSettingsV2: (settings: SyncSettingsV2) => call<SyncSettingsV2>('saveSyncSettingsV2', [settings]),
  workItemTypes: (projectId: string) => call<RoadmapWorkItemType[]>('workItemTypes', [projectId]),
  azureFields: (projectId: string, workItemType: string, refresh = false) => call<RoadmapAzureField[]>('azureFields', [projectId, workItemType, refresh]),
  azureStates: (projectId: string, workItemType: string) => call<RoadmapAzureState[]>('azureStates', [projectId, workItemType]),
  webhookSecret: () => call<{ secret: string }>('webhookSecret'),
  rotateWebhookSecret: () => call<{ secret: string }>('rotateWebhookSecret'),
  projects: () => call<RoadmapProjectsResult>('projects'),
  localProjects: () => call<RoadmapProjectsResult>('projects'),
  projectSummaries: (input: RoadmapPortfolioInput, signal?: AbortSignal) =>
    call<RoadmapPortfolio>('projectSummaries', [input], signal),
  syncProject: (project: AzureProject) => call<RoadmapProjectSyncResult>('syncProject', [project]),
  plan: (projectId: string) => call<RoadmapProjectPlan>('plan', [projectId]),
  createWorkItem: (): Promise<CreatedAzureWorkItem> =>
    Promise.reject(new Error('Создание карточек в Azure DevOps недоступно в демо.')),
  previewAzurePush: (projectId: string) => call<RoadmapAzurePushPreview>('previewAzurePush', [projectId]),
  pushProjectToAzure: (projectId: string, allocationIds?: string[]) => call<{ queued: number }>('pushProjectToAzure', [projectId, allocationIds]),
  pushAllocationToAzure: (allocationId: string) => call<{ queued: number }>('pushAllocationToAzure', [allocationId]),
  people: () => call<{ data: RoadmapPerson[] }>('people'),
  roles: (projectId: string) => call<RoadmapRole[]>('roles', [projectId]),
  adminPeople: () => call<RoadmapPerson[]>('adminPeople'),
  adminPersonAvatar: async () => ({ avatar: null }),
  syncAdminPeople: () => call<{ synced: number; ignored: number }>('syncAdminPeople'),
  adminRoles: (projectId?: string) => call<RoadmapRole[]>('adminRoles', projectId ? [projectId] : []),
  roleCatalog: () => call<RoadmapRoleTemplate[]>('roleCatalog'),
  createRoleTemplate: (name: string, color?: string, assignment?: RoadmapRoleAssignment & { projectId: string }) => call<RoadmapRoleTemplate>('createRoleTemplate', [name, color, assignment]),
  deleteRoleTemplate: (id: string) => call<{ deleted: boolean }>('deleteRoleTemplate', [id]),
  addRoleFromCatalog: (projectId: string, templateId: string, assignment: RoadmapRoleAssignment = {}) => call<RoadmapRole>('addRoleFromCatalog', [projectId, templateId, assignment]),
  createRole: (projectId: string, name: string, color?: string) => call<RoadmapRole>('createRole', [projectId, name, color]),
  updateRole: (id: string, input: { name?: string; color?: string } & RoadmapRoleAssignment) => call<RoadmapRole>('updateRole', [id, input]),
  setRoleMembers: (id: string, personExternalIds: string[]) => call<RoadmapRole>('setRoleMembers', [id, personExternalIds]),
  setRoleDefaultPerson: (id: string, personExternalId: string | null) => call<RoadmapRole>('setRoleDefaultPerson', [id, personExternalId]),
  deleteRole: (id: string) => call<{ deleted: boolean }>('deleteRole', [id]),
  saveAllocation: (input: {
    allocationId?: string; workItemId: string; roleId: string; personExternalId: string;
    personName: string; personEmail?: string | null; quarterKey: string; estimatedHours: number;
    periods: Omit<RoadmapPeriod, 'id'>[];
  }) => call<RoadmapAllocation>('saveAllocation', [input]),
  saveAllocationQuarter: (allocationId: string, quarterKey: string, months: { monthKey: string; hours: number }[]) =>
    call<RoadmapPeriod[]>('saveAllocationQuarter', [allocationId, quarterKey, months]),
  rebalanceAllocations: (allocationIds: string[]) => call<{ updated: number }>('rebalanceAllocations', [allocationIds]),
};
