import { normalizeSyncSettings } from '@tracker/shared';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  RoadmapAzureCatalogService,
  rolesFromEstimatePages,
} from './roadmap-azure-catalog.service';
import type { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

describe('Azure Roles Estimate catalog', () => {
  it('finds visible numeric role controls by field reference on the Roles Estimate tab', () => {
    const types = [
      {
        layout: {
          pages: [
            {
              label: 'Details',
              sections: [
                { groups: [{ controls: [{ id: 'Custom.ProjectEstimate' }] }] },
              ],
            },
            {
              label: 'Roles Estimate',
              sections: [
                {
                  groups: [
                    {
                      controls: [
                        {
                          id: 'Custom.AnalystHours',
                          label: 'Business Analyst Estimate',
                        },
                        { id: 'Custom.DeveloperEstimate' },
                        { id: 'Custom.BusinessValue' },
                        { id: 'Custom.HiddenEstimate', visible: false },
                        { id: 'Custom.DeveloperEstimate' },
                      ],
                    },
                    {
                      visible: false,
                      controls: [{ id: 'Custom.InternalEstimate' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ];
    const fields = [
      {
        referenceName: 'Custom.AnalystHours',
        name: 'Analyst Hours',
        type: 'integer',
      },
      {
        referenceName: 'Custom.DeveloperEstimate',
        name: 'Developer Estimate',
        type: 'double',
      },
      {
        referenceName: 'Custom.BusinessValue',
        name: 'Business Value Description',
        type: 'html',
      },
      {
        referenceName: 'Custom.ProjectEstimate',
        name: 'Project Estimate',
        type: 'double',
      },
      {
        referenceName: 'Custom.HiddenEstimate',
        name: 'Hidden Estimate',
        type: 'double',
      },
      {
        referenceName: 'Custom.InternalEstimate',
        name: 'Internal Estimate',
        type: 'integer',
      },
    ];

    expect(rolesFromEstimatePages(types, fields)).toEqual([
      { name: 'Business Analyst', referenceName: 'Custom.AnalystHours' },
      { name: 'Developer', referenceName: 'Custom.DeveloperEstimate' },
    ]);
  });

  it('finds the process by project ID when project capabilities omit its process', async () => {
    const projectId = '5aa52b7b-9baf-4c54-84f4-933d31fbde01';
    const transaction = {
      roadmapProject: {
        upsert: jest.fn().mockResolvedValue({ id: 'saved-project' }),
      },
      roadmapRole: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: (run: (tx: typeof transaction) => unknown) =>
        run(transaction),
    };
    const integration = {
      requestJson: jest.fn().mockImplementation((url: string) => {
        if (url.includes('/_apis/projects/'))
          return { id: projectId, name: 'Support' };
        if (url.includes('/processes?$expand=projects'))
          return {
            value: [
              { typeId: 'unrelated', projects: [{ id: 'other-project' }] },
              { typeId: 'project-process', projects: [{ id: projectId }] },
            ],
          };
        if (url.includes('/processes/project-process/workitemtypes'))
          return {
            value: [
              {
                layout: {
                  pages: [
                    {
                      label: 'Roles Estimate',
                      sections: [
                        {
                          groups: [
                            { controls: [{ id: 'Custom.AnalystHours' }] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          };
        if (url.includes('/_apis/wit/fields'))
          return {
            value: [
              {
                referenceName: 'Custom.AnalystHours',
                name: 'Business Analyst Estimate',
                type: 'integer',
              },
            ],
          };
        throw new Error('Unexpected catalog endpoint');
      }),
    };
    const catalog = new RoadmapAzureCatalogService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
    );

    await expect(
      catalog.syncProject(projectId, {
        organization: 'example',
        organizationUrl: 'https://dev.azure.com/example',
        pat: 'test',
      }),
    ).resolves.toEqual({ projectId: 'saved-project', importedRoles: 1 });
    expect(transaction.roadmapRole.create).toHaveBeenCalledWith({
      data: {
        projectId: 'saved-project',
        name: 'Business Analyst',
        azureEstimateField: 'Custom.AnalystHours',
      },
    });
  });

  it('reads and saves linked estimates even with explicit read rules and custom field names', async () => {
    const settings = normalizeSyncSettings({
      version: 2,
      readRules: [
        {
          id: 'team',
          workItemTypes: ['Feature'],
          field: 'Custom.Team',
          label: 'Команда',
          display: 'badge',
        },
      ],
    });
    const prisma = {
      $transaction: jest.fn(),
      roadmapRole: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ azureEstimateField: 'Custom.AnalystHours' }]),
      },
      roadmapWorkItem: { upsert: jest.fn() },
    };
    const integration = {
      getSyncSettings: jest.fn().mockResolvedValue(settings),
      requestJson: jest
        .fn()
        .mockResolvedValueOnce({
          value: [
            { referenceName: 'Custom.Team', name: 'Team' },
            { referenceName: 'Custom.AnalystHours', name: 'Analyst Hours' },
          ],
        })
        .mockResolvedValueOnce({
          value: [
            {
              id: 24373,
              url: 'https://dev.azure.com/example/_apis/wit/workItems/24373',
              fields: {
                'System.Title': 'Feature',
                'Custom.Team': 'Platform',
                'Custom.AnalystHours': 32,
              },
            },
          ],
        }),
    };
    const importer = new RoadmapWorkItemImportService(
      prisma as unknown as PrismaService,
      integration as unknown as RoadmapIntegrationService,
    );

    await importer.importWorkItems({ id: 'project' }, [24373], {
      organization: 'example',
      organizationUrl: 'https://dev.azure.com/example',
      pat: 'test',
    });

    const batchRequest = integration.requestJson.mock.calls[1][1] as {
      body: string;
    };
    expect(JSON.parse(batchRequest.body).fields).toEqual(
      expect.arrayContaining([
        'Custom.Team',
        'Custom.AnalystHours',
        'System.AssignedTo',
      ]),
    );
    expect(prisma.roadmapWorkItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          azureCustomFields: {
            'Custom.Team': 'Platform',
            'Custom.AnalystHours': 32,
            'System.AssignedTo': null,
          },
        }),
      }),
    );
  });
});
