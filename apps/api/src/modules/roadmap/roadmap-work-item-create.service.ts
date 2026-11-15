import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RoadmapWorkItemCreateRequest } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
  type AzureDevOpsCredentials,
} from './roadmap-integration.service';

const AZURE_TIMEOUT_MS = 20_000;
const REQUEST_IN_PROGRESS_MS = 60_000;
const AZURE_PROJECT_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const DEFINITIVE_AZURE_REJECTIONS = new Set([
  400, 401, 403, 404, 405, 415, 422, 429,
]);

export const ROADMAP_CREATE_WORK_ITEM_TYPES = [
  'Task',
  'Epic',
  'Feature',
] as const;

export type RoadmapWorkItemCreateInput = {
  requestId: string;
  type: (typeof ROADMAP_CREATE_WORK_ITEM_TYPES)[number];
  title: string;
  description?: string;
  parentExternalId?: string;
  personExternalId?: string;
};

type Project = {
  id: string;
  externalId: string;
  name: string;
  url: string | null;
};
type AzureProject = { id?: unknown; name?: unknown };
type AzurePatch = { op: 'add'; path: string; value: unknown };
type AzureCreatedItem = { id?: number; fields?: Record<string, unknown> };

export function azureOrganizationName(organizationUrl: string | null) {
  if (!organizationUrl) return null;
  try {
    const url = new URL(organizationUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const organization =
      url.hostname === 'dev.azure.com'
        ? url.pathname.split('/')[1]
        : url.hostname.match(/^([a-z0-9-]+)\.visualstudio\.com$/i)?.[1];
    return organization && /^[a-z0-9-]+$/i.test(organization)
      ? organization.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function canCreateRoadmapWorkItems(
  externalId: string,
  organizationUrl: string,
) {
  return (
    AZURE_PROJECT_ID.test(externalId) &&
    Boolean(azureOrganizationName(organizationUrl))
  );
}

export function roadmapCreatedWorkItemUrl(
  organization: string,
  projectName: string,
  externalId: string,
) {
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(projectName)}/_workitems/edit/${externalId}`;
}

function createError(status: HttpStatus, code: string, message: string) {
  return new HttpException({ error: { code, message } }, status);
}

function unknownOutcome() {
  return createError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'AZURE_CREATE_UNKNOWN',
    'Azure DevOps не подтвердил создание. Проверьте, появилась ли запись в Azure. Повтор этого запроса не создаст вторую запись.',
  );
}

@Injectable()
export class RoadmapWorkItemCreateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
  ) {}

  async createForLocalProject(
    projectId: string,
    input: RoadmapWorkItemCreateInput,
  ) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Проект не найден в Roadmap.');
    return this.create(project.externalId, input);
  }

  async create(externalId: string, input: RoadmapWorkItemCreateInput) {
    const dto = {
      requestId: input.requestId.toLowerCase(),
      type: input.type,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      parentExternalId: input.parentExternalId || undefined,
      personExternalId: input.personExternalId || undefined,
    };
    if (!dto.title) throw new BadRequestException('Введите название.');
    if (dto.type === 'Epic' && dto.parentExternalId)
      throw new BadRequestException(
        'Эпик создаётся на верхнем уровне проекта.',
      );
    if (!AZURE_PROJECT_ID.test(externalId))
      throw new BadRequestException('Выберите проект Azure DevOps.');

    const currentCredentials = await this.integration.getCredentials();
    const organization = azureOrganizationName(
      currentCredentials.organizationUrl,
    );
    if (!organization) {
      throw new BadRequestException(
        'Проверьте адрес организации в настройках Azure DevOps.',
      );
    }
    const credentials = {
      ...currentCredentials,
      organizationUrl: `https://dev.azure.com/${organization}`,
    };

    const { requestId, ...payload } = dto;
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    const existing = await this.findRequest(requestId);
    if (existing)
      return this.reuse(existing, externalId, dto, payloadHash, organization);
    if (dto.type === 'Epic' && dto.personExternalId)
      throw new BadRequestException('На эпики нельзя назначать исполнителей.');
    const project = await this.getAzureProject(externalId, credentials);
    const operations = await this.buildOperations(project, dto, credentials);

    // Claim this key before sending so concurrent requests and API restarts cannot repeat the write.
    const claim = await this.prisma.roadmapWorkItemCreateRequest.createMany({
      data: {
        requestId,
        projectId: project.id,
        payloadHash,
        type: dto.type,
        status: 'sending',
        azureOrganization: organization,
      },
      skipDuplicates: true,
    });
    if (!claim.count) {
      const concurrent = await this.findRequest(requestId);
      if (concurrent)
        return this.reuse(
          concurrent,
          externalId,
          dto,
          payloadHash,
          organization,
        );
      throw createError(
        HttpStatus.CONFLICT,
        'AZURE_CREATE_IN_PROGRESS',
        'Запрос обрабатывается. Повторите попытку.',
      );
    }

    let item: AzureCreatedItem;
    try {
      item = await this.integration.requestJson<AzureCreatedItem>(
        `${credentials.organizationUrl.replace(/\/$/, '')}/${project.externalId}/_apis/wit/workitems/$${dto.type}?api-version=7.1`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json-patch+json' },
          body: JSON.stringify(operations),
          signal: AbortSignal.timeout(AZURE_TIMEOUT_MS),
        },
        credentials,
      );
    } catch (error) {
      if (
        error instanceof AzureDevOpsHttpError &&
        DEFINITIVE_AZURE_REJECTIONS.has(error.httpStatus)
      ) {
        await this.prisma.roadmapWorkItemCreateRequest.delete({
          where: { requestId },
        });
        throw this.rejected(error.httpStatus);
      }
      await this.markUnknown(requestId);
      throw unknownOutcome();
    }

    const azureId = item?.id;
    if (
      typeof azureId !== 'number' ||
      !Number.isSafeInteger(azureId) ||
      azureId <= 0
    ) {
      await this.markUnknown(requestId);
      throw unknownOutcome();
    }
    let receipt: RoadmapWorkItemCreateRequest;
    try {
      receipt = await this.prisma.roadmapWorkItemCreateRequest.update({
        where: { requestId },
        data: {
          status: 'created',
          azureId: String(azureId),
          azureTitle:
            typeof item.fields?.['System.Title'] === 'string'
              ? item.fields['System.Title'].slice(0, 255)
              : dto.title,
          azureState:
            typeof item.fields?.['System.State'] === 'string'
              ? item.fields['System.State'].slice(0, 100)
              : null,
        },
      });
    } catch {
      await this.markUnknown(requestId);
      throw unknownOutcome();
    }
    return this.finish(receipt, project, dto, organization);
  }

  private async getAzureProject(
    externalId: string,
    credentials: AzureDevOpsCredentials,
  ): Promise<Project> {
    const projectUrl = `${credentials.organizationUrl}/_apis/projects/${encodeURIComponent(externalId.toLowerCase())}`;
    let azureProject: AzureProject;
    try {
      azureProject = await this.integration.requestJson<AzureProject>(
        `${projectUrl}?api-version=7.1`,
        { signal: AbortSignal.timeout(AZURE_TIMEOUT_MS) },
        credentials,
      );
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError) {
        if ([401, 403].includes(error.httpStatus))
          throw this.rejected(error.httpStatus);
        if (error.httpStatus === 404)
          throw new NotFoundException(
            'Выбранный проект недоступен в текущей организации Azure DevOps.',
          );
      }
      throw createError(
        HttpStatus.BAD_GATEWAY,
        'AZURE_CREATE_PROJECT_CHECK_FAILED',
        'Не удалось проверить проект в Azure DevOps. Повторите попытку.',
      );
    }
    const name =
      typeof azureProject?.name === 'string' ? azureProject.name.trim() : '';
    if (
      !name ||
      name.length > 255 ||
      typeof azureProject?.id !== 'string' ||
      azureProject.id.toLowerCase() !== externalId.toLowerCase()
    ) {
      throw createError(
        HttpStatus.BAD_GATEWAY,
        'AZURE_CREATE_PROJECT_CHECK_FAILED',
        'Azure DevOps не подтвердил выбранный проект.',
      );
    }
    const organization = azureOrganizationName(credentials.organizationUrl);
    const existing = await this.prisma.roadmapProject.findUnique({
      where: { externalId: externalId.toLowerCase() },
      select: { url: true },
    });
    const importedOrganization = azureOrganizationName(existing?.url ?? null);
    if (importedOrganization && importedOrganization !== organization) {
      throw new ForbiddenException(
        'Этот проект привязан к другой организации Azure DevOps.',
      );
    }
    const data = { name, url: projectUrl };
    return this.prisma.roadmapProject.upsert({
      where: { externalId: externalId.toLowerCase() },
      create: { externalId: externalId.toLowerCase(), ...data },
      update: data,
      select: { id: true, externalId: true, name: true, url: true },
    });
  }

  private findRequest(requestId: string) {
    return this.prisma.roadmapWorkItemCreateRequest.findUnique({
      where: { requestId },
      include: {
        project: {
          select: { id: true, externalId: true, name: true, url: true },
        },
      },
    });
  }

  private async buildOperations(
    project: Project,
    dto: RoadmapWorkItemCreateInput,
    credentials: AzureDevOpsCredentials,
  ) {
    const operations: AzurePatch[] = [
      { op: 'add', path: '/fields/System.Title', value: dto.title },
    ];
    if (dto.description) {
      const description = dto.description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, '<br>');
      operations.push({
        op: 'add',
        path: '/fields/System.Description',
        value: description,
      });
    }
    if (dto.personExternalId) {
      const person = await this.prisma.roadmapPerson.findUnique({
        where: { externalId: dto.personExternalId },
        select: { email: true, isActive: true, isMock: true },
      });
      if (!person?.isActive || person.isMock || !person.email?.trim()) {
        throw new BadRequestException(
          'Выберите активного сотрудника с учётной записью Azure DevOps.',
        );
      }
      operations.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: person.email.trim(),
      });
    }
    if (dto.parentExternalId) {
      const parentTypes =
        dto.type === 'Feature' ? ['epic'] : ['epic', 'feature'];
      const invalidParentMessage =
        dto.type === 'Feature'
          ? 'Выберите существующий эпик этого проекта.'
          : 'Выберите существующую фичу или эпик этого проекта.';
      const parent = await this.prisma.roadmapWorkItem.findUnique({
        where: {
          projectId_externalId: {
            projectId: project.id,
            externalId: dto.parentExternalId,
          },
        },
        select: { type: true, state: true },
      });
      if (
        !parent ||
        !parentTypes.includes(parent.type.toLowerCase()) ||
        parent.state?.toLowerCase() === 'deleted'
      ) {
        throw new BadRequestException(invalidParentMessage);
      }
      const base = credentials.organizationUrl.replace(/\/$/, '');
      const parentUrl = `${base}/${project.externalId}/_apis/wit/workitems/${dto.parentExternalId}`;
      let currentParent: AzureCreatedItem;
      try {
        currentParent = await this.integration.requestJson<AzureCreatedItem>(
          `${parentUrl}?fields=System.TeamProject,System.WorkItemType&api-version=7.1`,
          { signal: AbortSignal.timeout(AZURE_TIMEOUT_MS) },
          credentials,
        );
      } catch (error) {
        if (error instanceof AzureDevOpsHttpError) {
          if (error.httpStatus === 404)
            throw new BadRequestException(
              'Родительская запись больше не доступна в Azure DevOps.',
            );
          if ([401, 403].includes(error.httpStatus))
            throw this.rejected(error.httpStatus);
        }
        throw createError(
          HttpStatus.BAD_GATEWAY,
          'AZURE_CREATE_PARENT_CHECK_FAILED',
          'Не удалось проверить родительскую запись в Azure DevOps. Повторите попытку.',
        );
      }
      const parentProject = currentParent?.fields?.['System.TeamProject'];
      const parentType = currentParent?.fields?.['System.WorkItemType'];
      if (
        String(currentParent?.id) !== dto.parentExternalId ||
        typeof parentProject !== 'string' ||
        parentProject.toLowerCase() !== project.name.toLowerCase() ||
        typeof parentType !== 'string' ||
        !parentTypes.includes(parentType.toLowerCase())
      ) {
        throw new BadRequestException(invalidParentMessage);
      }
      operations.push({
        op: 'add',
        path: '/relations/-',
        value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: parentUrl },
      });
    }
    return operations;
  }

  private async reuse(
    request: RoadmapWorkItemCreateRequest & { project: Project },
    externalId: string,
    dto: RoadmapWorkItemCreateInput,
    payloadHash: string,
    organization: string,
  ) {
    const originalOrganization =
      request.azureOrganization ?? azureOrganizationName(request.project.url);
    if (
      request.project.externalId.toLowerCase() !== externalId.toLowerCase() ||
      request.payloadHash !== payloadHash ||
      originalOrganization !== organization
    ) {
      throw createError(
        HttpStatus.CONFLICT,
        'AZURE_CREATE_REQUEST_MISMATCH',
        'Этот запрос уже использован с другими данными.',
      );
    }
    if (request.azureId)
      return this.finish(request, request.project, dto, organization);
    if (
      request.status === 'sending' &&
      Date.now() - request.updatedAt.getTime() < REQUEST_IN_PROGRESS_MS
    ) {
      throw createError(
        HttpStatus.CONFLICT,
        'AZURE_CREATE_IN_PROGRESS',
        'Запрос уже отправлен. Подождите и повторите попытку.',
      );
    }
    throw unknownOutcome();
  }

  private async markUnknown(requestId: string) {
    await this.prisma.roadmapWorkItemCreateRequest
      .updateMany({
        where: { requestId, status: 'sending' },
        data: { status: 'unknown' },
      })
      .catch(() => undefined);
  }

  private async finish(
    request: RoadmapWorkItemCreateRequest,
    project: Project,
    dto: RoadmapWorkItemCreateInput,
    organization: string,
  ) {
    const externalId = request.azureId!;
    const title = request.azureTitle ?? dto.title;
    const url = roadmapCreatedWorkItemUrl(
      organization,
      project.name,
      externalId,
    );
    if (request.status !== 'complete') {
      try {
        await this.prisma.$transaction([
          this.prisma.roadmapWorkItem.upsert({
            where: {
              projectId_externalId: { projectId: project.id, externalId },
            },
            create: {
              projectId: project.id,
              externalId,
              parentExternalId: dto.parentExternalId,
              type: dto.type,
              title,
              state: request.azureState,
              url,
            },
            // A webhook may have already imported the item with a newer state.
            update: {},
          }),
          this.prisma.roadmapWorkItemCreateRequest.update({
            where: { requestId: request.requestId },
            data: { status: 'complete' },
          }),
        ]);
      } catch {
        throw createError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'AZURE_CREATE_LOCAL_PENDING',
          `Запись №${externalId} создана в Azure DevOps. Повторите запрос, чтобы сохранить её в Roadmap.`,
        );
      }
    }
    return { projectId: project.id, externalId, title, type: dto.type, url };
  }

  private rejected(status: number) {
    if (status === 401 || status === 403) {
      return createError(
        HttpStatus.FORBIDDEN,
        'AZURE_CREATE_ACCESS_DENIED',
        'Azure DevOps отклонил доступ. Проверьте токен с правом Work Items: Read & Write и права на выбранный проект.',
      );
    }
    return createError(
      HttpStatus.BAD_GATEWAY,
      'AZURE_CREATE_REJECTED',
      status === 429
        ? 'Azure DevOps ограничил частоту запросов. Попробуйте позже.'
        : 'Azure DevOps не принял запрос. Проверьте обязательные поля и права на создание этого типа записи.',
    );
  }
}
