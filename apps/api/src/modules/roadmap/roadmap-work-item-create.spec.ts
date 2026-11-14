import { ForbiddenException } from '@nestjs/common';
import type { RoadmapWorkItemCreateRequest } from '@prisma/client';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { AzureDevOpsHttpError, type RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemCreateService, type RoadmapWorkItemCreateInput } from './roadmap-work-item-create.service';

const organizationUrl = 'https://dev.azure.com/medipalprojects';
const project = {
  id: 'roadmap-project',
  externalId: '2d07b6cf-4aa8-42ee-b149-401007af63ad',
  name: 'SUPPORT MT',
  url: `${organizationUrl}/_apis/projects/2d07b6cf-4aa8-42ee-b149-401007af63ad`,
};
const newProject = {
  id: 'another-roadmap-project',
  externalId: '7f78c933-4645-41df-a684-090a9af661e1',
  name: 'Новый проект',
  url: 'https://dev.azure.com/second-org/_apis/projects/7f78c933-4645-41df-a684-090a9af661e1',
};
const input = {
  requestId: '21d06586-4866-4446-8ab7-cb68865612b4',
  type: 'Task',
  title: 'Test task',
  parentExternalId: '24373',
  description: '<script>\nОписание',
  personExternalId: 'azure-person',
} satisfies RoadmapWorkItemCreateInput;

function fixture(selectedProject = project, selectedOrganization = organizationUrl) {
  let row: RoadmapWorkItemCreateRequest | null = null;
  const requests = {
    findUnique: jest.fn(() => Promise.resolve(row && { ...row, project: selectedProject })),
    createMany: jest.fn(({ data }: { data: RoadmapWorkItemCreateRequest }) => {
      if (row) return Promise.resolve({ count: 0 });
      row = { azureId: null, azureTitle: null, azureState: null, ...data, updatedAt: new Date() };
      return Promise.resolve({ count: 1 });
    }),
    update: jest.fn(({ data }: { data: Partial<RoadmapWorkItemCreateRequest> }) => {
      row = { ...row!, ...data, updatedAt: new Date() };
      return Promise.resolve({ ...row });
    }),
    updateMany: jest.fn(({ data }: { data: Partial<RoadmapWorkItemCreateRequest> }) => {
      row = { ...row!, ...data, updatedAt: new Date() };
      return Promise.resolve({ count: 1 });
    }),
    delete: jest.fn(() => {
      row = null;
      return Promise.resolve();
    }),
  };
  const prisma = {
    roadmapProject: {
      findUnique: jest.fn().mockResolvedValue(selectedProject),
      upsert: jest.fn().mockResolvedValue(selectedProject),
    },
    roadmapPerson: { findUnique: jest.fn().mockResolvedValue({ email: 'user@example.test', isActive: true, isMock: false }) },
    roadmapWorkItem: {
      findUnique: jest.fn().mockResolvedValue({ type: 'Feature', state: 'Active' }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    roadmapWorkItemCreateRequest: requests,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const integration = {
    getCredentials: jest.fn().mockResolvedValue({ organizationUrl: selectedOrganization, pat: 'fixture-only' }),
    requestJson: jest.fn().mockImplementation((url: string, options: RequestInit) => {
      if (options.method === 'POST') return Promise.resolve({ id: 12345, fields: { 'System.State': 'New' } });
      if (url.includes('/_apis/projects/')) return Promise.resolve({ id: selectedProject.externalId, name: selectedProject.name });
      return Promise.resolve({ id: 24373, fields: { 'System.TeamProject': selectedProject.name, 'System.WorkItemType': 'Feature' } });
    }),
  };
  return {
    service: new RoadmapWorkItemCreateService(prisma as unknown as PrismaService, integration as unknown as RoadmapIntegrationService),
    integration,
    prisma,
  };
}

describe('Roadmap work item creation', () => {
  it('rejects an Epic assignee before contacting Azure', async () => {
    const { service, integration } = fixture();
    const epic = { ...input, type: 'Epic', parentExternalId: undefined } as const;

    await expect(service.create(project.externalId, epic)).rejects.toThrow('На эпики нельзя назначать исполнителей.');
    expect(integration.requestJson).not.toHaveBeenCalled();
  });

  it('creates a Task in the selected project and saves its canonical link once for the same key', async () => {
    const { service, integration, prisma } = fixture();
    const result = {
      projectId: project.id, externalId: '12345', title: input.title, type: 'Task',
      url: `${organizationUrl}/SUPPORT%20MT/_workitems/edit/12345`,
    };
    await expect(service.create(project.externalId, input)).resolves.toEqual(result);
    await expect(service.createForLocalProject(project.id, input)).resolves.toEqual(result);
    expect(integration.requestJson).toHaveBeenCalledTimes(3);
    const [url, options] = integration.requestJson.mock.calls[2] as [string, RequestInit];
    expect(url).toBe(`${organizationUrl}/${project.externalId}/_apis/wit/workitems/$Task?api-version=7.1`);
    expect(JSON.parse(options.body as string)).toEqual([
      { op: 'add', path: '/fields/System.Title', value: 'Test task' },
      { op: 'add', path: '/fields/System.Description', value: '&lt;script&gt;<br>Описание' },
      { op: 'add', path: '/fields/System.AssignedTo', value: 'user@example.test' },
      { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${organizationUrl}/${project.externalId}/_apis/wit/workitems/24373` } },
    ]);
    expect(prisma.roadmapWorkItem.upsert).toHaveBeenCalledTimes(1);
    const [persisted] = prisma.roadmapWorkItem.upsert.mock.calls[0] as [{ create: unknown }];
    expect(persisted.create).toMatchObject({ parentExternalId: '24373', url: result.url });
  });

  it.each([undefined, '24373'])('creates a Feature with optional Epic parent %s', async (parentExternalId) => {
    const { service, integration, prisma } = fixture();
    prisma.roadmapWorkItem.findUnique.mockResolvedValue({ type: 'Epic', state: 'Active' });
    if (parentExternalId) {
      integration.requestJson
        .mockResolvedValueOnce({ id: project.externalId, name: project.name })
        .mockResolvedValueOnce({ id: 24373, fields: { 'System.TeamProject': project.name, 'System.WorkItemType': 'Epic' } });
    }

    const feature = { requestId: input.requestId, type: 'Feature', title: 'Test feature', parentExternalId } as const;
    await expect(service.create(project.externalId, feature)).resolves.toMatchObject({ type: 'Feature', externalId: '12345' });

    const [url, options] = integration.requestJson.mock.lastCall as [string, RequestInit];
    expect(url).toBe(`${organizationUrl}/${project.externalId}/_apis/wit/workitems/$Feature?api-version=7.1`);
    const operations = [{ op: 'add', path: '/fields/System.Title', value: feature.title }] as Array<{ op: string; path: string; value: unknown }>;
    if (parentExternalId) operations.push({
      op: 'add', path: '/relations/-',
      value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${organizationUrl}/${project.externalId}/_apis/wit/workitems/${parentExternalId}` },
    });
    expect(JSON.parse(options.body as string)).toEqual(operations);
    expect(prisma.roadmapWorkItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: 'Feature', parentExternalId }),
    }));
  });

  it.each(['Feature', 'Epic'])('rejects a Feature parent even when the local type is %s', async (localType) => {
    const { service, integration, prisma } = fixture();
    prisma.roadmapWorkItem.findUnique.mockResolvedValue({ type: localType, state: 'Active' });
    const feature = { requestId: input.requestId, type: 'Feature', title: 'Test feature', parentExternalId: '24373' } as const;

    await expect(service.create(project.externalId, feature)).rejects.toThrow('Выберите существующий эпик этого проекта.');
    expect(integration.requestJson).toHaveBeenCalledTimes(localType === 'Epic' ? 2 : 1);
    expect(prisma.roadmapWorkItemCreateRequest.createMany).not.toHaveBeenCalled();
  });

  it('prevents a repeated POST when an Azure response is lost, including a concurrent submit', async () => {
    const { service, integration } = fixture();
    let rejectSend!: (error: Error) => void;
    let didSend!: () => void;
    const send = new Promise((resolve) => { didSend = () => resolve(undefined); });
    integration.requestJson
      .mockResolvedValueOnce({ id: project.externalId, name: project.name })
      .mockImplementationOnce(() => {
        didSend();
        return new Promise((_, reject) => { rejectSend = reject; });
      });
    const epic = { requestId: input.requestId, type: 'Epic', title: 'Test epic' } as const;
    const first = service.create(project.externalId, epic);
    await send;
    await expect(service.create(project.externalId, epic)).rejects.toMatchObject({
      response: { error: { code: 'AZURE_CREATE_IN_PROGRESS' } },
    });
    rejectSend(new Error('connection closed after send'));
    await expect(first).rejects.toMatchObject({ response: { error: { code: 'AZURE_CREATE_UNKNOWN' } } });
    await expect(service.create(project.externalId, epic)).rejects.toMatchObject({
      response: { error: { code: 'AZURE_CREATE_UNKNOWN' } },
    });
    await expect(service.create(project.externalId, { ...epic, title: 'Different epic' })).rejects.toMatchObject({
      response: { error: { code: 'AZURE_CREATE_REQUEST_MISMATCH' } },
    });
    expect(integration.requestJson).toHaveBeenCalledTimes(2);
  });

  it('permits retry after an explicit Azure permission rejection', async () => {
    const { service, integration } = fixture();
    const epic = { requestId: input.requestId, type: 'Epic', title: 'Test epic' } as const;
    integration.requestJson
      .mockResolvedValueOnce({ id: project.externalId, name: project.name })
      .mockRejectedValueOnce(new AzureDevOpsHttpError(403, 'private response'));
    await expect(service.create(project.externalId, epic)).rejects.toMatchObject({
      response: { error: { code: 'AZURE_CREATE_ACCESS_DENIED' } },
    });
    await expect(service.create(project.externalId, epic)).resolves.toMatchObject({ type: 'Epic', externalId: '12345' });
    expect(integration.requestJson).toHaveBeenCalledTimes(4);
  });

  it('adds a new Azure project and creates an Epic using the connected organization', async () => {
    const { service, prisma, integration } = fixture(newProject, 'https://second-org.visualstudio.com');
    prisma.roadmapProject.findUnique.mockResolvedValueOnce(null);
    await expect(service.create(newProject.externalId, { requestId: input.requestId, type: 'Epic', title: 'New Epic' })).resolves.toEqual({
      projectId: newProject.id,
      externalId: '12345',
      title: 'New Epic',
      type: 'Epic',
      url: `https://dev.azure.com/second-org/${encodeURIComponent(newProject.name)}/_workitems/edit/12345`,
    });
    expect(prisma.roadmapProject.upsert).toHaveBeenCalledWith({
      where: { externalId: newProject.externalId },
      create: { externalId: newProject.externalId, name: newProject.name, url: newProject.url },
      update: { name: newProject.name, url: newProject.url },
      select: { id: true, externalId: true, name: true, url: true },
    });
    const [url] = integration.requestJson.mock.calls[1] as [string];
    expect(url).toBe(`https://dev.azure.com/second-org/${newProject.externalId}/_apis/wit/workitems/$Epic?api-version=7.1`);
  });

  it('rejects a project that cannot be verified in the current organization', async () => {
    const { service, prisma, integration } = fixture();
    integration.requestJson.mockRejectedValueOnce(new AzureDevOpsHttpError(404, 'private response'));
    await expect(service.create(project.externalId, input)).rejects.toThrow('Выбранный проект недоступен в текущей организации Azure DevOps.');
    expect(prisma.roadmapProject.upsert).not.toHaveBeenCalled();
    expect(integration.requestJson).toHaveBeenCalledTimes(1);
  });

  it('prevents a project or request from being rebound to a different organization', async () => {
    const { service, integration } = fixture();
    const epic = { requestId: input.requestId, type: 'Epic', title: 'Test epic' } as const;
    integration.getCredentials.mockResolvedValueOnce({ organizationUrl: 'https://dev.azure.com/another-org', pat: 'fixture-only' });
    await expect(service.create(project.externalId, epic)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create(project.externalId, epic)).resolves.toMatchObject({ externalId: '12345' });
    integration.getCredentials.mockResolvedValueOnce({ organizationUrl: 'https://dev.azure.com/another-org', pat: 'fixture-only' });
    await expect(service.create(project.externalId, epic)).rejects.toMatchObject({
      response: { error: { code: 'AZURE_CREATE_REQUEST_MISMATCH' } },
    });
    expect(integration.requestJson).toHaveBeenCalledTimes(3);
  });

  it('validates that the parent still belongs to the selected project before writing to Azure', async () => {
    const { service, integration } = fixture();
    integration.requestJson
      .mockResolvedValueOnce({ id: project.externalId, name: project.name })
      .mockResolvedValueOnce({
        id: 24373,
        fields: { 'System.TeamProject': 'Another project', 'System.WorkItemType': 'Feature' },
      });
    await expect(service.create(project.externalId, input)).rejects.toThrow('Выберите существующую фичу или эпик этого проекта.');
    expect(integration.requestJson).toHaveBeenCalledTimes(2);
  });
});
