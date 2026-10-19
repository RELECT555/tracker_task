import type {
  AzureProject,
  RoadmapAllocation,
  RoadmapAzurePushPreview,
  RoadmapReadinessCheck,
  RoadmapWriteBackOverview,
  RoadmapWriteBackSettings,
  RoadmapIntegrationSettings,
  RoadmapPeriod,
  RoadmapPerson,
  RoadmapProjectPlan,
  RoadmapRole,
} from './roadmapApi';

type DemoMethod =
  | 'connection' | 'integrationSettings' | 'saveIntegrationSettings' | 'testIntegrationConnection'
  | 'projects' | 'syncProject' | 'plan' | 'people' | 'roles' | 'adminPeople' | 'syncAdminPeople'
  | 'adminRoles' | 'roleCatalog' | 'createRoleTemplate' | 'addRoleFromCatalog' | 'createRole'
  | 'updateRole' | 'setRoleMembers' | 'setRoleDefaultPerson' | 'deleteRole' | 'saveAllocation'
  | 'saveAllocationQuarter' | 'saveWriteBackSettings' | 'writeBackOverview' | 'checkWriteBack'
  | 'webhookSecret' | 'rotateWebhookSecret' | 'previewAzurePush' | 'pushProjectToAzure' | 'pushAllocationToAzure';

async function call<T>(method: DemoMethod, args: unknown[] = []): Promise<T> {
  const response = await fetch('/api/roadmap-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Demo request failed (${response.status})`);
  return body.data as T;
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
  webhookSecret: () => call<{ secret: string }>('webhookSecret'),
  rotateWebhookSecret: () => call<{ secret: string }>('rotateWebhookSecret'),
  projects: () => call<{ data: AzureProject[]; source: 'cache' }>('projects'),
  syncProject: (project: AzureProject) => call<{ projectId: string; importedWorkItems: number }>('syncProject', [project]),
  plan: (projectId: string) => call<RoadmapProjectPlan>('plan', [projectId]),
  previewAzurePush: (projectId: string) => call<RoadmapAzurePushPreview>('previewAzurePush', [projectId]),
  pushProjectToAzure: (projectId: string, allocationIds?: string[]) => call<{ queued: number }>('pushProjectToAzure', [projectId, allocationIds]),
  pushAllocationToAzure: (allocationId: string) => call<{ queued: number }>('pushAllocationToAzure', [allocationId]),
  people: () => call<{ data: RoadmapPerson[] }>('people'),
  roles: (projectId: string) => call<RoadmapRole[]>('roles', [projectId]),
  adminPeople: () => call<RoadmapPerson[]>('adminPeople'),
  syncAdminPeople: () => call<{ synced: number; ignored: number }>('syncAdminPeople'),
  adminRoles: (projectId: string) => call<RoadmapRole[]>('adminRoles', [projectId]),
  roleCatalog: () => call<Pick<RoadmapRole, 'id' | 'name' | 'color' | 'isMock'>[]>('roleCatalog'),
  createRoleTemplate: (name: string, color?: string) => call<Pick<RoadmapRole, 'id' | 'name' | 'color' | 'isMock'>>('createRoleTemplate', [name, color]),
  addRoleFromCatalog: (projectId: string, templateId: string) => call<RoadmapRole>('addRoleFromCatalog', [projectId, templateId]),
  createRole: (projectId: string, name: string, color?: string) => call<RoadmapRole>('createRole', [projectId, name, color]),
  updateRole: (id: string, input: { name?: string; color?: string }) => call<RoadmapRole>('updateRole', [id, input]),
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
};
