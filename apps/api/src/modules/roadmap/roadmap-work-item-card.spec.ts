import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { htmlToText, isPlainHtml, textToHtml } from './azure-html';
import type { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import {
  AzureDevOpsHttpError,
  type RoadmapIntegrationService,
} from './roadmap-integration.service';
import { RoadmapWorkItemCardService } from './roadmap-work-item-card.service';
import type { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

describe('Azure HTML helpers', () => {
  it('turns Azure HTML into readable text', () => {
    expect(
      htmlToText(
        '<div>Первая&nbsp;строка<br>вторая</div><p>A &amp; B &#8212; C</p>',
      ),
    ).toBe('Первая строка\nвторая\nA & B — C');
  });

  it('writes typed text back as escaped paragraphs', () => {
    expect(textToHtml('a < b\nc\n\n<script>')).toBe(
      '<div>a &lt; b<br>c</div><div>&lt;script&gt;</div>',
    );
  });

  it('allows editing only descriptions without formatting', () => {
    expect(isPlainHtml('<div>Текст<br/></div><p></p>')).toBe(true);
    expect(isPlainHtml(null)).toBe(true);
    expect(isPlainHtml('<ul><li>пункт</li></ul>')).toBe(false);
    expect(isPlainHtml('<div style="color:red">x</div>')).toBe(false);
    expect(isPlainHtml('<a href="https://x">x</a>')).toBe(false);
  });
});

function setup({
  mode = 'manual',
  canPush = true,
}: { mode?: string; canPush?: boolean } = {}) {
  const item = {
    id: 101,
    rev: 7,
    fields: {
      'System.TeamProject': 'Portal',
      'System.WorkItemType': 'Feature',
      'System.Title': 'Старое название',
      'System.State': 'New',
      'System.Description': '<div>Описание</div>',
      'System.AssignedTo': {
        displayName: 'Иван',
        uniqueName: 'ivan@example.test',
      },
    },
    relations: [],
    _links: {
      html: { href: 'https://dev.azure.com/org/Portal/_workitems/edit/101' },
    },
  };
  const requestJson = jest
    .fn()
    .mockImplementation((url: string) => Promise.resolve(azureResponse(url)));
  function azureResponse(url: string) {
    if (url.includes('/comments?')) return { comments: [] };
    if (url.includes('/updates?')) return { value: [] };
    if (url.includes('/states?'))
      return { value: [{ name: 'New' }, { name: 'Active' }] };
    return structuredClone(item);
  }
  const request = jest.fn().mockResolvedValue(undefined);
  const integration = {
    getCredentials: jest.fn().mockResolvedValue({
      organizationUrl: 'https://dev.azure.com/org',
      pat: 'x',
    }),
    getWriteBackSettings: jest
      .fn()
      .mockResolvedValue({ mode, projectIds: null }),
    requestJson,
    request,
  };
  const prisma = {
    roadmapProject: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'project',
        externalId: 'azure-project',
        name: 'Portal',
      }),
    },
    roadmapWorkItem: {
      findUnique: jest.fn().mockResolvedValue({ id: 'local' }),
    },
    roadmapRoleMember: { findMany: jest.fn().mockResolvedValue([]) },
    roadmapAzureProjectState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Мария Петрова' }),
    },
  };
  const importer = { importWorkItems: jest.fn().mockResolvedValue([]) };
  const service = new RoadmapWorkItemCardService(
    prisma as unknown as PrismaService,
    integration as unknown as RoadmapIntegrationService,
    importer as unknown as RoadmapWorkItemImportService,
    {
      canManuallyPush: jest.fn().mockResolvedValue(canPush),
    } as unknown as RoadmapAzureSyncService,
  );
  const patch = () =>
    JSON.parse(
      (request.mock.calls[0] as [string, { body: string }])[1].body,
    ) as {
      op: string;
      path: string;
      value: unknown;
    }[];
  return { service, request, importer, prisma, patch };
}

const actor = { id: 'user', email: 'maria@example.test' };

describe('Azure work item card', () => {
  it('reads the card live from Azure with plain-text description', async () => {
    const { service } = setup();

    const card = await service.getCard('project', '101', 'user', true);

    expect(card).toMatchObject({
      id: '101',
      rev: 7,
      title: 'Старое название',
      descriptionText: 'Описание',
      descriptionEditable: true,
      assignedTo: { name: 'Иван', email: 'ivan@example.test' },
      localWorkItemId: 'local',
      canEdit: true,
      states: [{ name: 'New' }, { name: 'Active' }],
    });
  });

  it('sends only changed fields with the revision check and names the editor', async () => {
    const { service, patch, importer } = setup();

    await service.update(
      'project',
      '101',
      {
        rev: 7,
        title: 'Новое название',
        state: 'New',
        assignedTo: 'IVAN@example.test',
      },
      actor,
      true,
    );

    expect(patch()).toEqual([
      { op: 'test', path: '/rev', value: 7 },
      { op: 'add', path: '/fields/System.Title', value: 'Новое название' },
      {
        op: 'add',
        path: '/fields/System.History',
        value: '<div><i>Изменено в Roadmap: Мария Петрова</i></div>',
      },
    ]);
    expect(importer.importWorkItems).toHaveBeenCalledWith(
      { id: 'project' },
      [101],
      expect.anything(),
    );
  });

  it('records the local re-read after an edit as import health', async () => {
    const { service, prisma } = setup();

    await service.update(
      'project',
      '101',
      { rev: 7, title: 'Новое название' },
      actor,
      true,
    );

    expect(prisma.roadmapAzureProjectState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'project' },
        update: { importFailingSince: null, lastImportOkAt: expect.any(Date) },
      }),
    );
  });

  it('keeps swallowing a failed local re-read but records the failure', async () => {
    const { service, prisma, importer } = setup();
    importer.importWorkItems.mockRejectedValueOnce(
      new Error('Azure DevOps returned 503'),
    );

    await expect(
      service.update(
        'project',
        '101',
        { rev: 7, title: 'Новое название' },
        actor,
        true,
      ),
    ).resolves.toBeDefined();

    expect(prisma.roadmapAzureProjectState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'project' },
        update: expect.objectContaining({
          lastImportError: 'Azure DevOps returned 503',
        }),
      }),
    );
  });

  it('does not call Azure when nothing changed', async () => {
    const { service, request } = setup();

    await service.update(
      'project',
      '101',
      { rev: 7, title: 'Старое название', description: 'Описание' },
      actor,
      true,
    );

    expect(request).not.toHaveBeenCalled();
  });

  it('reports a change made in Azure meanwhile as a conflict', async () => {
    const { service, request } = setup();
    request.mockRejectedValueOnce(
      new AzureDevOpsHttpError(412, 'rev mismatch'),
    );

    await expect(
      service.update(
        'project',
        '101',
        { rev: 6, state: 'Active' },
        actor,
        true,
      ),
    ).rejects.toThrow('изменили в Azure DevOps');
  });

  it('is read-only when write-back is off', async () => {
    const { service, request } = setup({ mode: 'off' });

    const card = await service.getCard('project', '101', 'user', true);
    expect(card.canEdit).toBe(false);
    await expect(
      service.addComment('project', '101', 'Привет', actor, true),
    ).rejects.toThrow('выключена');
    expect(request).not.toHaveBeenCalled();
  });

  it('signs comments with the Roadmap user', async () => {
    const { service, request } = setup();

    await service.addComment('project', '101', 'Проверил <ok>', actor, true);

    const [url, init] = request.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('/workItems/101/comments');
    expect(JSON.parse(init.body)).toEqual({
      text: '<div>Проверил &lt;ok&gt;</div><div><i>— Мария Петрова, через Roadmap</i></div>',
    });
  });
});
