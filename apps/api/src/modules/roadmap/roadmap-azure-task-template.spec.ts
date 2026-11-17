import { normalizeSyncSettings } from '@tracker/shared';
import type { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapAzureTaskService } from './roadmap-azure-task.service';
import type {
  AzureDevOpsCredentials,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import { normalizeWriteBackSettings } from './roadmap-write-back.settings';
import type { AllocationWithContext } from './roadmap-azure-sync.shared';

type Operation = { op: string; path: string; value?: unknown };

const credentials = {
  organizationUrl: 'https://dev.azure.com/org',
} as AzureDevOpsCredentials;
const allocation = {
  quarterKey: '2026-Q4',
  estimatedHours: 8,
  personName: 'Иван; Петров',
  workItem: {
    externalId: '101',
    title: 'Заявки',
    project: { externalId: 'project' },
  },
  role: { name: 'Backend' },
} as unknown as AllocationWithContext;

function setup() {
  const integration = {
    requestJson: jest
      .fn()
      .mockResolvedValue({ fields: { 'System.AreaPath': 'Team' } }),
  };
  const azureProcess = {
    quarterIterationPath: jest.fn().mockResolvedValue('Project\\Q4'),
  };
  const service = new RoadmapAzureTaskService(
    integration as unknown as RoadmapIntegrationService,
    azureProcess as unknown as RoadmapAzureProcessService,
  );
  const create = (stored: unknown, attemptId?: string) =>
    service.createOperations(
      allocation,
      'ivan@example.test',
      normalizeWriteBackSettings(stored as never),
      new Set([
        'System.Description',
        'System.AreaPath',
        'Microsoft.VSTS.Scheduling.OriginalEstimate',
        'Microsoft.VSTS.Scheduling.RemainingWork',
      ]),
      credentials,
      attemptId,
    ) as Promise<Operation[]>;
  return { create };
}

const field = (operations: Operation[], name: string) =>
  operations.filter((operation) => operation.path === `/fields/${name}`);

describe('Task creation from templates', () => {
  it('writes the description from the settings rule, as escaped HTML, exactly once', async () => {
    const operations = await setup().create(undefined);
    const description = field(operations, 'System.Description');
    expect(description).toHaveLength(1);
    expect(description[0]?.value).toBe(
      '<div>Создано из Roadmap. Роль: Backend, квартал: Q4 2026. Оценку и исполнителя меняйте в Roadmap — они перезаписываются при отправке плана. Фактическое время списывайте в Completed Work этой задачи.</div>',
    );
  });

  it('uses an edited description template instead of the built-in text', async () => {
    const stored = normalizeSyncSettings(undefined);
    stored.writeRules = stored.writeRules.map((rule) =>
      rule.targetField === 'System.Description'
        ? {
            ...rule,
            source: {
              kind: 'template' as const,
              template: 'Роль {role} <b>\n\nПочта: {personEmail}',
            },
          }
        : rule,
    );
    const description = field(
      await setup().create(stored),
      'System.Description',
    );
    expect(description).toHaveLength(1);
    expect(description[0]?.value).toBe(
      '<div>Роль Backend &lt;b&gt;</div><div>Почта: ivan@example.test</div>',
    );
  });

  it('keeps the legacy short description text up to date with the full default', () => {
    const migrated = normalizeSyncSettings({
      version: 2,
      writeRules: [
        {
          id: 'v1-description',
          targetField: 'System.Description',
          source: {
            kind: 'template',
            template:
              'Создано из Roadmap. Роль: {role}, квартал: {quarter}. Оценку и исполнителя меняйте в Roadmap.',
          },
          apply: 'create',
          enabled: true,
        },
      ],
    });
    expect(migrated.writeRules[0]?.source).toMatchObject({
      template: expect.stringContaining('Completed Work'),
    });
  });

  it('renders tags as separate tags with the shared tokens and keeps the attempt tag', async () => {
    const stored = {
      ...normalizeSyncSettings(undefined),
      tagsTemplate: 'Roadmap; {quarterKey}; {person}',
    };
    const tags = field(await setup().create(stored, 'attempt'), 'System.Tags');
    expect(tags[0]?.value).toBe(
      'Roadmap; 2026-Q4; Иван, Петров; Roadmap-Create-attempt',
    );
  });

  it('supports every documented token in the title', async () => {
    const stored = {
      ...normalizeSyncSettings(undefined),
      titleTemplate: '{role} / {title} / {quarter} / {personEmail} / {id}',
    };
    const title = field(await setup().create(stored), 'System.Title');
    expect(title[0]?.value).toBe(
      'Backend / Заявки / Q4 2026 / ivan@example.test / 101',
    );
  });
});
