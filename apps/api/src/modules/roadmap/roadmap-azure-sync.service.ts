import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { evaluateWriteRules, type TemplateContext } from '@tracker/shared';
import { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import {
  AzureDevOpsCredentials,
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import {
  AzureWorkItem,
  RoadmapWorkItemImportService,
} from './roadmap-work-item-import.service';
import { azureOrganizationName } from './roadmap-work-item-create.service';
import { importWorkItemsRecorded } from './roadmap-import-health';
import { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';
import {
  decideEstimate,
  hoursField,
  scalePeriods,
} from './roadmap-allocation-reconcile';
import {
  quarterLabel,
  renderWriteBackTags,
  renderWriteBackTemplate,
  WriteBackSettings,
  WriteBackTemplateValues,
} from './roadmap-write-back.settings';

type IterationNode = {
  name: string;
  path?: string;
  attributes?: { startDate?: string; finishDate?: string };
  children?: IterationNode[];
};
type PatchOperation = {
  op: 'add' | 'replace' | 'test';
  path: string;
  value: unknown;
};
type CacheEntry<T> = { value: T; loadedAt: number };
type AllocationWithContext = Prisma.RoadmapAllocationGetPayload<{
  include: { role: true; workItem: { include: { project: true } } };
}>;
export type ReadinessCheck = {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
};
type AzureFieldMetadata = {
  referenceName: string;
  name?: string;
  type?: string;
  isCustom?: boolean;
  readOnly?: boolean;
  isIdentity?: boolean;
  isPicklist?: boolean;
  alwaysRequired?: boolean;
  allowedValues?: string[];
  defaultValue?: unknown;
  helpText?: string;
};

export function worstReadinessStatus(
  checks: ReadinessCheck[] | null,
): ReadinessCheck['status'] | null {
  if (!checks?.length) return null;
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'ok';
}

export type AzureWebhookPayload = {
  eventType?: string;
  resource?: { id?: number; workItemId?: number };
  resourceContainers?: { project?: { id?: string } };
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_DEBOUNCE_MS = 1500;
const SYNC_CLAIM_MS = 5 * 60_000;
const SYNC_REQUEST_TIMEOUT_MS = 30_000;
const CREATE_REJECTIONS = new Set([400, 401, 403, 404, 405, 415, 422, 429]);
const UNKNOWN_CREATE =
  'Azure DevOps не подтвердил создание задачи. Повторная отправка проверит, появилась ли задача.';
const ORIGINAL_ESTIMATE = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
const REMAINING_WORK = 'Microsoft.VSTS.Scheduling.RemainingWork';
const COMPLETED_WORK = 'Microsoft.VSTS.Scheduling.CompletedWork';
/** Fields that `updateTask` writes only when they actually changed. */
const UPDATE_MANAGED_FIELDS = new Set([
  'System.AssignedTo',
  ORIGINAL_ESTIMATE,
  REMAINING_WORK,
]);
const allocationContext = {
  role: true,
  workItem: { include: { project: true } },
} as const;
const nonEpicWorkItem = {
  type: { not: 'Epic', mode: 'insensitive' },
} satisfies Prisma.RoadmapWorkItemWhereInput;

/**
 * Two-way Azure DevOps sync: every Roadmap allocation is mirrored by an Azure DevOps work item
 * (assignee + Original/Remaining Work = plan), and service hook events bring Completed Work (fact)
 * and other work item changes back without a manual synchronization.
 */
@Injectable()
export class RoadmapAzureSyncService {
  private readonly logger = new Logger(RoadmapAzureSyncService.name);
  private readonly apiVersion = '7.1';
  private readonly queue = new Set<string>();
  private draining: Promise<void> | null = null;
  private readonly typeFieldCache = new Map<string, CacheEntry<Set<string>>>();
  private readonly fieldMetadataCache = new Map<
    string,
    CacheEntry<AzureFieldMetadata[]>
  >();
  private readonly iterationCache = new Map<
    string,
    CacheEntry<IterationNode | null>
  >();
  private readonly pendingImports = new Map<string, Set<number>>();
  private importTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
    private readonly isActiveAdmin: IsActiveAdminHandler,
    private readonly allocationAzure: RoadmapAllocationAzureService,
  ) {}

  /** Status written by plan edits: the allocation must be sent to Azure DevOps again. */
  readonly pendingUpdate = {
    azureSyncStatus: 'pending',
    azureSyncError: null,
  } satisfies Prisma.RoadmapAllocationUpdateInput;

  /** Called after a plan edit; only automatic mode sends right away. */
  async onAllocationSaved(allocationId: string) {
    const settings = await this.integration
      .getWriteBackSettings()
      .catch(() => null);
    if (settings?.mode === 'auto') this.enqueue([allocationId]);
  }

  /** Sends every assignment of the project that is not synced yet, or only the selected ones. */
  async pushProject(
    actorId: string,
    projectId: string,
    allocationIds?: string[],
  ) {
    const settings = await this.assertWriteBackEnabled(actorId);
    this.assertProjectAllowed(settings, projectId);
    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: {
        workItem: { projectId, ...nonEpicWorkItem },
        ...(allocationIds?.length
          ? { id: { in: allocationIds } }
          : {
              OR: [
                { azureSyncStatus: null },
                { azureSyncStatus: { not: 'synced' } },
              ],
            }),
      },
      select: { id: true },
    });
    const ids = allocations.map((allocation) => allocation.id);
    if (ids.length) {
      const result = await this.prisma.roadmapAllocation.updateMany({
        where: { id: { in: ids }, azureSyncClaimId: null },
        data: { ...this.pendingUpdate, azureSyncRequested: true },
      });
      this.enqueue(ids);
      return { queued: result.count };
    }
    return { queued: 0 };
  }

  async pushAllocation(actorId: string, allocationId: string) {
    const settings = await this.assertWriteBackEnabled(actorId);
    const allocation = await this.prisma.roadmapAllocation.findUnique({
      where: { id: allocationId },
      select: { workItem: { select: { projectId: true, type: true } } },
    });
    if (!allocation)
      throw new NotFoundException('Roadmap allocation was not found');
    if (allocation.workItem.type.toLowerCase() === 'epic')
      throw new BadRequestException('На эпики нельзя назначать исполнителей.');
    this.assertProjectAllowed(settings, allocation.workItem.projectId);
    const result = await this.prisma.roadmapAllocation.updateMany({
      where: { id: allocationId, azureSyncClaimId: null },
      data: { ...this.pendingUpdate, azureSyncRequested: true },
    });
    if (result.count) this.enqueue([allocationId]);
    return { queued: result.count };
  }

  /** What "Send to Azure" would do, computed locally without calling Azure DevOps. */
  async previewProject(actorId: string, projectId: string) {
    const settings = await this.integration.getWriteBackSettings();
    await this.assertCanManuallyPush(actorId, settings);
    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: {
        workItem: { projectId, ...nonEpicWorkItem },
        OR: [{ azureSyncStatus: null }, { azureSyncStatus: { not: 'synced' } }],
      },
      include: allocationContext,
      orderBy: [{ quarterKey: 'asc' }, { personName: 'asc' }],
    });
    const people = await this.peopleByExternalId(
      allocations.map((allocation) => allocation.personExternalId),
    );
    const projectAllowed =
      !settings.projectIds || settings.projectIds.includes(projectId);
    const items = allocations.map((allocation) => {
      const person = people.get(allocation.personExternalId);
      const assignee = person?.email ?? allocation.personEmail;
      const hasTask = Boolean(
        allocation.azureTaskId || allocation.azureCreateAttemptId,
      );
      const roleField = this.roleFieldName(settings, allocation.role);
      const skipReason = !projectAllowed
        ? 'Проект не включён в запись плана'
        : person?.isMock
          ? 'Демо-участник'
          : allocation.azureSyncClaimId
            ? 'Назначение уже отправляется'
            : hasTask && !assignee
              ? 'Нет email у участника'
              : !hasTask && !roleField
                ? 'У роли нет поля оценки в Azure DevOps'
                : null;
      return {
        allocationId: allocation.id,
        workItemExternalId: allocation.workItem.externalId,
        workItemTitle: allocation.workItem.title,
        roleName: allocation.role.name,
        personName: allocation.personName,
        assignee: assignee ?? null,
        quarterKey: allocation.quarterKey,
        estimatedHours: Number(allocation.estimatedHours),
        pushedHours:
          allocation.azurePushedHours === null
            ? null
            : Number(allocation.azurePushedHours),
        action: skipReason ? 'skip' : hasTask ? 'update' : 'field',
        skipReason,
        roleField: hasTask ? null : roleField,
        taskTitle: null,
        azureTaskId: allocation.azureTaskId,
        status: allocation.azureSyncStatus,
        error: allocation.azureSyncError,
      };
    });
    return {
      mode: settings.mode,
      workItemType: settings.workItemType,
      projectAllowed,
      counts: {
        field: items.filter((item) => item.action === 'field').length,
        update: items.filter((item) => item.action === 'update').length,
        skip: items.filter((item) => item.action === 'skip').length,
      },
      items,
    };
  }

  /** Per-project sync health for the integration page. */
  async overview() {
    const [settings, projects, allocations, errors] = await Promise.all([
      this.integration.getWriteBackSettings(),
      this.prisma.roadmapProject.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          externalId: true,
          name: true,
          url: true,
          syncedAt: true,
          azureState: true,
        },
      }),
      this.prisma.roadmapAllocation.findMany({
        where: { workItem: nonEpicWorkItem },
        select: {
          azureSyncStatus: true,
          azureSyncedAt: true,
          workItem: { select: { projectId: true } },
        },
      }),
      this.prisma.roadmapAllocation.findMany({
        where: { azureSyncStatus: 'error', workItem: nonEpicWorkItem },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
          role: true,
          workItem: {
            select: { projectId: true, externalId: true, title: true },
          },
        },
      }),
    ]);
    return {
      settings,
      projects: projects.map((project) => {
        const own = allocations.filter(
          (allocation) => allocation.workItem.projectId === project.id,
        );
        const count = (status: string | null) =>
          own.filter((allocation) => allocation.azureSyncStatus === status)
            .length;
        const lastPushedAt = own.reduce<Date | null>(
          (latest, allocation) =>
            allocation.azureSyncedAt &&
            (!latest || allocation.azureSyncedAt > latest)
              ? allocation.azureSyncedAt
              : latest,
          null,
        );
        return {
          ...project,
          enabled:
            !settings.projectIds || settings.projectIds.includes(project.id),
          total: own.length,
          counts: {
            notSent: count(null),
            pending: count('pending'),
            sending: count('sending'),
            synced: count('synced'),
            error: count('error'),
            conflict: count('conflict'),
            skipped: count('skipped'),
          },
          lastPushedAt,
          lastCheckAt: project.azureState?.lastCheckAt ?? null,
          lastCheckStatus: this.worstCheckStatus(
            project.azureState?.lastCheckResult,
          ),
          lastCheck: this.readinessChecks(project.azureState?.lastCheckResult),
          lastWebhookAt: project.azureState?.lastWebhookAt ?? null,
        };
      }),
      errors: errors.map((allocation) => ({
        allocationId: allocation.id,
        projectId: allocation.workItem.projectId,
        workItemExternalId: allocation.workItem.externalId,
        workItemTitle: allocation.workItem.title,
        roleName: allocation.role.name,
        personName: allocation.personName,
        quarterKey: allocation.quarterKey,
        error: allocation.azureSyncError,
        updatedAt: allocation.updatedAt,
      })),
    };
  }

  async workItemTypes(projectId: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const credentials = await this.integration.getCredentials();
    const result = await this.integration.requestJson<{
      value?: {
        name: string;
        referenceName?: string;
        icon?: { id?: string };
        color?: string;
      }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitemtypes?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    return (result.value ?? []).map((item) => ({
      name: item.name,
      referenceName: item.referenceName ?? item.name,
      icon: item.icon?.id,
      color: item.color,
    }));
  }

  async fields(projectId: string, workItemType: string, refresh = false) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const cacheKey = `${project.externalId}:${workItemType}`;
    const cached = this.fieldMetadataCache.get(cacheKey);
    if (!refresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS)
      return cached.value;
    const credentials = await this.integration.getCredentials();
    const [typeFields, globalFields] = await Promise.all([
      this.integration.requestJson<{ value?: AzureFieldMetadata[] }>(
        `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/fields?$expand=all&api-version=${this.apiVersion}`,
        undefined,
        credentials,
      ),
      this.integration.requestJson<{ value?: AzureFieldMetadata[] }>(
        `${credentials.organizationUrl}/_apis/wit/fields?api-version=${this.apiVersion}`,
        undefined,
        credentials,
      ),
    ]);
    const globalByName = new Map(
      (globalFields.value ?? []).map((field) => [field.referenceName, field]),
    );
    const result = (typeFields.value ?? []).map((field) => {
      const global = globalByName.get(field.referenceName);
      return {
        referenceName: field.referenceName,
        name: field.name ?? global?.name ?? field.referenceName,
        type: field.type ?? global?.type ?? 'string',
        isCustom:
          field.isCustom ??
          global?.isCustom ??
          field.referenceName.startsWith('Custom.'),
        readOnly: field.readOnly ?? global?.readOnly ?? false,
        isIdentity: field.isIdentity ?? global?.isIdentity ?? false,
        isPicklist: field.isPicklist ?? global?.isPicklist ?? false,
        alwaysRequired: field.alwaysRequired ?? false,
        allowedValues: field.allowedValues,
        defaultValue: field.defaultValue,
        helpText: field.helpText ?? global?.helpText,
      };
    });
    this.fieldMetadataCache.set(cacheKey, {
      value: result,
      loadedAt: Date.now(),
    });
    return result;
  }

  async states(projectId: string, workItemType: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const credentials = await this.integration.getCredentials();
    const result = await this.integration.requestJson<{
      value?: { name: string; category?: string; color?: string }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/states?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    return result.value ?? [];
  }

  /**
   * Checks everything write-back depends on without changing Azure DevOps:
   * creation is validated with `validateOnly=true`, which checks permissions, type, fields and assignee.
   */
  async checkProject(projectId: string): Promise<{ checks: ReadinessCheck[] }> {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const settings = await this.integration.getWriteBackSettings();
    const checks: ReadinessCheck[] = [];
    let credentials: AzureDevOpsCredentials;
    try {
      credentials = await this.integration.getCredentials();
      await this.integration.requestJson(
        `${credentials.organizationUrl}/_apis/projects/${encodeURIComponent(project.externalId)}?api-version=${this.apiVersion}`,
        undefined,
        credentials,
      );
      checks.push({
        key: 'connection',
        label: 'Подключение и доступ к проекту',
        status: 'ok',
        detail: `Проект «${project.name}» доступен`,
      });
    } catch (error) {
      checks.push({
        key: 'connection',
        label: 'Подключение и доступ к проекту',
        status: 'error',
        detail: this.message(error),
      });
      await this.persistCheckResult(projectId, checks);
      return { checks };
    }

    checks.push(
      settings.mode === 'off'
        ? {
            key: 'mode',
            label: 'Режим записи',
            status: 'warning',
            detail: 'Запись выключена — в Azure DevOps ничего не отправляется',
          }
        : {
            key: 'mode',
            label: 'Режим записи',
            status: 'ok',
            detail:
              settings.mode === 'auto'
                ? 'Автоматически при сохранении'
                : 'По кнопке «Отправить в Azure»',
          },
    );
    checks.push(
      !settings.projectIds || settings.projectIds.includes(projectId)
        ? {
            key: 'scope',
            label: 'Проект включён в запись',
            status: 'ok',
            detail: settings.projectIds
              ? 'Проект в списке разрешённых'
              : 'Запись разрешена для всех проектов',
          }
        : {
            key: 'scope',
            label: 'Проект включён в запись',
            status: 'error',
            detail:
              'Проект не выбран в настройках записи — его назначения будут пропущены',
          },
    );

    let typeFields: Set<string> | null = null;
    try {
      typeFields = await this.typeFields(
        project.externalId,
        settings.workItemType,
        credentials,
        true,
      );
      const missing = [
        settings.fields.originalEstimate && !typeFields.has(ORIGINAL_ESTIMATE)
          ? 'Original Estimate'
          : null,
        settings.fields.remainingWork && !typeFields.has(REMAINING_WORK)
          ? 'Remaining Work'
          : null,
        !typeFields.has(COMPLETED_WORK) ? 'Completed Work (факт)' : null,
      ].filter(Boolean);
      checks.push(
        missing.length
          ? {
              key: 'type',
              label: `Тип «${settings.workItemType}» и поля`,
              status: 'warning',
              detail: `В процессе проекта нет полей: ${missing.join(', ')}. Они будут пропущены.`,
            }
          : {
              key: 'type',
              label: `Тип «${settings.workItemType}» и поля`,
              status: 'ok',
              detail: 'Тип и поля плана/факта есть в процессе проекта',
            },
      );
    } catch (error) {
      checks.push({
        key: 'type',
        label: `Тип «${settings.workItemType}» и поля`,
        status: 'error',
        detail: this.message(error),
      });
    }

    const now = new Date();
    const currentQuarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    if (settings.fields.iteration) {
      const iteration = await this.quarterIterationPath(
        project.externalId,
        currentQuarter,
        credentials,
        true,
      );
      checks.push(
        iteration
          ? {
              key: 'iteration',
              label: `Итерация для ${quarterLabel(currentQuarter)}`,
              status: 'ok',
              detail: iteration,
            }
          : {
              key: 'iteration',
              label: `Итерация для ${quarterLabel(currentQuarter)}`,
              status: 'warning',
              detail:
                'Не найдена итерация с кварталом в названии или датами на весь квартал — задачи попадут в итерацию проекта по умолчанию',
            },
      );
    }

    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: { workItem: { projectId, ...nonEpicWorkItem } },
      include: allocationContext,
    });
    const people = await this.peopleByExternalId(
      allocations.map((allocation) => allocation.personExternalId),
    );
    const withoutEmail = new Set(
      allocations
        .filter(
          (allocation) =>
            !people.get(allocation.personExternalId)?.isMock &&
            !(
              people.get(allocation.personExternalId)?.email ??
              allocation.personEmail
            ),
        )
        .map((allocation) => allocation.personName),
    );
    const mock = new Set(
      allocations
        .filter((allocation) => people.get(allocation.personExternalId)?.isMock)
        .map((allocation) => allocation.personName),
    );
    checks.push(
      withoutEmail.size
        ? {
            key: 'people',
            label: 'Участники',
            status: 'warning',
            detail: `Нет email, назначения не отправятся: ${[...withoutEmail].join(', ')}`,
          }
        : {
            key: 'people',
            label: 'Участники',
            status: 'ok',
            detail: mock.size
              ? `Демо-участники будут пропущены: ${[...mock].join(', ')}`
              : 'У всех участников есть учётная запись',
          },
    );

    const sample = allocations.find((allocation) => {
      const person = people.get(allocation.personExternalId);
      return !person?.isMock && (person?.email ?? allocation.personEmail);
    });
    if (typeFields) {
      try {
        const operations = sample
          ? await this.createOperations(
              sample,
              people.get(sample.personExternalId)?.email ?? sample.personEmail!,
              settings,
              typeFields,
              credentials,
            )
          : [
              {
                op: 'add' as const,
                path: '/fields/System.Title',
                value: 'Roadmap readiness check',
              },
            ];
        await this.integration.requestJson(
          `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitems/$${encodeURIComponent(settings.workItemType)}?validateOnly=true&api-version=${this.apiVersion}`,
          {
            method: 'POST',
            body: JSON.stringify(operations),
            headers: { 'Content-Type': 'application/json-patch+json' },
          },
          credentials,
        );
        checks.push({
          key: 'write',
          label: 'Пробное создание задачи (без сохранения)',
          status: 'ok',
          detail: sample
            ? `Azure DevOps принял бы задачу «${renderWriteBackTemplate(settings.titleTemplate, this.templateValues(sample))}» для ${sample.personName}`
            : 'Права на запись есть',
        });
      } catch (error) {
        const forbidden =
          error instanceof AzureDevOpsHttpError &&
          [401, 403].includes(error.httpStatus);
        checks.push({
          key: 'write',
          label: 'Пробное создание задачи (без сохранения)',
          status: 'error',
          detail: forbidden
            ? 'У PAT нет прав на запись. Выпустите PAT с правами Work Items: Read & Write.'
            : this.message(error),
        });
      }
    }

    const publicSettings = await this.integration.getPublicSettings();
    checks.push(
      publicSettings.webhookConfigured
        ? {
            key: 'webhook',
            label: 'Webhook для факта',
            status: 'ok',
            detail:
              'Секрет создан. Убедитесь, что подписка в Azure DevOps активна.',
          }
        : {
            key: 'webhook',
            label: 'Webhook для факта',
            status: 'warning',
            detail:
              'Без webhook задачи и факт обновляются каждые 5 минут. Для обработки удалений подключите webhook.',
          },
    );
    await this.persistCheckResult(projectId, checks);
    return { checks };
  }

  /** Recovers expired claims and durable manual requests after a restart. */
  @Interval(60_000)
  async recoverPending() {
    const settings = await this.integration
      .getWriteBackSettings()
      .catch(() => null);
    if (!settings || settings.mode === 'off') return;
    await this.prisma.roadmapAllocation.updateMany({
      where: {
        azureSyncClaimedAt: { lt: new Date(Date.now() - SYNC_CLAIM_MS) },
      },
      data: {
        ...this.pendingUpdate,
        azureSyncClaimId: null,
        azureSyncClaimedAt: null,
        azureSyncRequested: true,
      },
    });
    const pending = await this.prisma.roadmapAllocation.findMany({
      where: {
        workItem: nonEpicWorkItem,
        azureSyncStatus: 'pending',
        azureSyncClaimId: null,
        ...(settings.mode === 'manual' ? { azureSyncRequested: true } : {}),
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    });
    if (pending.length)
      this.enqueue(pending.map((allocation) => allocation.id));
  }

  async handleWebhook(payload: AzureWebhookPayload) {
    const projectExternalId = payload.resourceContainers?.project?.id;
    const eventType = payload.eventType ?? '';
    const workItemId =
      eventType === 'workitem.updated'
        ? payload.resource?.workItemId
        : payload.resource?.id;
    if (!projectExternalId || !workItemId || !eventType.startsWith('workitem.'))
      return { accepted: false };
    const project = await this.prisma.roadmapProject.findUnique({
      where: { externalId: projectExternalId },
      select: { id: true },
    });
    if (!project) return { accepted: false };

    await this.prisma.roadmapAzureProjectState.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, lastWebhookAt: new Date() },
      update: { lastWebhookAt: new Date() },
    });

    if (eventType === 'workitem.deleted') {
      await this.handleDeletedWorkItem(project.id, String(workItemId));
      return { accepted: true };
    }
    if (eventType === 'workitem.commented') return { accepted: false };

    // Bursts of events (bulk edits, our own pushes) are imported in one batch per project.
    const ids = this.pendingImports.get(project.id) ?? new Set<number>();
    ids.add(Number(workItemId));
    this.pendingImports.set(project.id, ids);
    this.importTimer ??= setTimeout(
      () => void this.flushWebhookImports(),
      WEBHOOK_DEBOUNCE_MS,
    );
    return { accepted: true };
  }

  private enqueue(allocationIds: string[]) {
    allocationIds.forEach((id) => this.queue.add(id));
    this.kick();
  }

  private async persistCheckResult(
    projectId: string,
    checks: ReadinessCheck[],
  ) {
    await this.prisma.roadmapAzureProjectState.upsert({
      where: { projectId },
      create: { projectId, lastCheckAt: new Date(), lastCheckResult: checks },
      update: { lastCheckAt: new Date(), lastCheckResult: checks },
    });
  }

  private readinessChecks(
    value: Prisma.JsonValue | null | undefined,
  ): ReadinessCheck[] | null {
    if (!Array.isArray(value)) return null;
    return value.filter((item): item is ReadinessCheck =>
      Boolean(
        item && typeof item === 'object' && 'key' in item && 'status' in item,
      ),
    );
  }

  private worstCheckStatus(
    value: Prisma.JsonValue | null | undefined,
  ): ReadinessCheck['status'] | null {
    const checks = this.readinessChecks(value);
    return worstReadinessStatus(checks);
  }

  private kick() {
    if (this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
      if (this.queue.size) this.kick();
    });
  }

  private async drain() {
    while (this.queue.size) {
      const [id] = this.queue;
      this.queue.delete(id);
      try {
        await this.syncAllocation(id);
      } catch (error) {
        this.logger.error(
          `Azure DevOps write-back failed for allocation ${id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  /**
   * Sends one allocation. Its hours always go to the role field of the feature; an Azure DevOps
   * Task is created only on request (`createTask`) and, once it exists, is kept up to date.
   */
  private async syncAllocation(id: string, createTask = false) {
    const settings = await this.integration.getWriteBackSettings();
    if (settings.mode === 'off') return;
    const claimId = randomUUID();
    const claim = await this.prisma.roadmapAllocation.updateMany({
      where: {
        id,
        azureSyncStatus: 'pending',
        azureSyncClaimId: null,
        ...(settings.mode === 'manual' ? { azureSyncRequested: true } : {}),
      },
      data: {
        azureSyncStatus: 'sending',
        azureSyncClaimId: claimId,
        azureSyncClaimedAt: new Date(),
      },
    });
    if (!claim.count) return;
    const allocation = await this.prisma.roadmapAllocation.findUnique({
      where: { id },
      include: allocationContext,
    });
    if (!allocation || allocation.azureSyncClaimId !== claimId) return;
    let taskId = allocation.azureTaskId;
    const owned = { id, azureSyncClaimId: claimId };
    const release = { azureSyncClaimId: null, azureSyncClaimedAt: null };
    const finish = async (
      data: Prisma.RoadmapAllocationUpdateManyMutationInput,
    ) => {
      const result = await this.prisma.roadmapAllocation.updateMany({
        where: { ...owned, azureSyncStatus: 'sending' },
        data: { ...release, azureSyncRequested: false, ...data },
      });
      if (!result.count) {
        // A plan edit changed the row while this worker held the claim.
        const released = await this.prisma.roadmapAllocation.updateMany({
          where: owned,
          data: release,
        });
        if (released.count) this.enqueue([id]);
      }
    };

    try {
      if (allocation.workItem.type.toLowerCase() === 'epic') {
        await finish({ azureSyncStatus: 'skipped', azureSyncError: null });
        return;
      }
      if (
        settings.projectIds &&
        !settings.projectIds.includes(allocation.workItem.projectId)
      ) {
        await finish({
          azureSyncStatus: 'skipped',
          azureSyncError:
            'Проект не включён в запись плана в настройках интеграции',
        });
        return;
      }
      const person = await this.prisma.roadmapPerson.findUnique({
        where: { externalId: allocation.personExternalId },
      });
      if (person?.isMock) {
        await finish({
          azureSyncStatus: 'skipped',
          azureSyncError: 'Демо-участник не передаётся в Azure DevOps',
        });
        return;
      }
      // Without a Task only the role field of the feature is written; no assignee is needed for it.
      if (
        !createTask &&
        !allocation.azureTaskId &&
        !allocation.azureCreateAttemptId
      ) {
        if (!(await this.featureRoleField(settings, allocation.roleId))) {
          await finish({
            azureSyncStatus: 'skipped',
            azureSyncError:
              'У роли нет поля оценки в Azure DevOps — часы остаются только в плане.',
          });
          return;
        }
        await this.writeFeatureAggregates(
          allocation.workItemId,
          settings,
          await this.integration.getCredentials(),
        );
        await finish({
          azureSyncStatus: 'synced',
          azureSyncError: null,
          azureSyncedAt: new Date(),
        });
        return;
      }
      const assignee = person?.email ?? allocation.personEmail;
      if (!assignee) {
        await finish({
          azureSyncStatus: 'error',
          azureSyncError:
            'У участника нет email или учётной записи Azure DevOps',
        });
        return;
      }
      const credentials = await this.integration.getCredentials();
      const project = allocation.workItem.project;
      /** The role total is refreshed after the row is settled; a failure puts the row in error. */
      const refreshFeatureField = async () => {
        try {
          await this.writeFeatureAggregates(
            allocation.workItemId,
            settings,
            credentials,
          );
        } catch (error) {
          await this.prisma.roadmapAllocation.updateMany({
            where: {
              id,
              azureSyncClaimId: null,
              azureSyncStatus: { in: ['synced', 'skipped'] },
            },
            data: {
              azureSyncStatus: 'error',
              azureSyncError:
                `Часы не записаны в поле роли у фичи: ${this.message(error)}`.slice(
                  0,
                  1000,
                ),
            },
          });
        }
      };
      const estimate = Number(allocation.estimatedHours);
      const estimateChanged =
        Boolean(allocation.azureCreateAttemptId) ||
        allocation.azurePushedHours === null ||
        Number(allocation.azurePushedHours) !== estimate;
      let existing: AzureWorkItem | null = null;
      /** Set when Azure's estimate wins over the plan (conflict policy "skip-field"). */
      let acceptedHours: number | null = null;

      // Zero hours takes the person off the plan: no new Task, and the old one follows the removal policy.
      if (estimate === 0 && !allocation.azureCreateAttemptId) {
        if (!taskId) {
          await finish({
            azureSyncStatus: 'skipped',
            azureSyncError: 'Нет часов — задача в Azure DevOps не создаётся.',
          });
          return;
        }
        const removal = settings.removalPolicy ?? { action: 'keep' };
        if (removal.action !== 'keep') {
          const outcome = await this.allocationAzure.applyRemoval(
            project.externalId,
            taskId,
            removal,
            credentials,
          );
          await finish({
            azureSyncStatus: 'skipped',
            azureSyncError:
              outcome === 'deleted'
                ? 'Часы обнулены — задача удалена в Azure DevOps (лежит в корзине).'
                : 'Часы обнулены — задача в Azure DevOps снята.',
            azurePushedHours: 0,
            azureSyncedAt: new Date(),
            ...(outcome === 'deleted' ? { azureTaskId: null } : {}),
          });
          await refreshFeatureField();
          return;
        }
      }

      if (allocation.azureCreateAttemptId) {
        const organization = azureOrganizationName(credentials.organizationUrl);
        if (
          !organization ||
          organization !== allocation.azureCreateOrganization
        )
          throw new Error(UNKNOWN_CREATE);
        const recovered = await this.findCreatedAllocationTask(
          project.externalId,
          allocation.azureCreateAttemptId,
          credentials,
        );
        existing = await this.fetchTask(String(recovered), credentials);
        if (!existing) throw new Error(UNKNOWN_CREATE);
        taskId = String(existing.id);
      } else if (taskId) {
        existing = await this.fetchTask(taskId, credentials);
      }
      if (existing) {
        const existingType = existing.fields['System.WorkItemType'];
        const typeName =
          typeof existingType === 'string'
            ? existingType
            : settings.workItemType;
        const typeFields = await this.typeFields(
          project.externalId,
          typeName,
          credentials,
        );
        // Someone may have changed the estimate in Azure since the last push.
        let pushEstimate = estimateChanged;
        if (estimateChanged && !allocation.azureCreateAttemptId) {
          const decision = decideEstimate({
            azure: hoursField(existing.fields[ORIGINAL_ESTIMATE]),
            pushed:
              allocation.azurePushedHours === null
                ? null
                : Number(allocation.azurePushedHours),
            planned: estimate,
            policy: settings.conflictPolicy ?? 'overwrite',
          });
          if (decision.action === 'conflict') {
            await finish({
              azureSyncStatus: 'conflict',
              azureSyncError: decision.message,
            });
            return;
          }
          if (decision.action === 'accept' && decision.hours !== estimate) {
            pushEstimate = false;
            acceptedHours = decision.hours;
          }
        }
        await this.updateTask(
          existing,
          {
            allocation,
            assignee,
            estimate,
            estimateChanged: pushEstimate,
            settings,
            typeFields,
            projectExternalId: project.externalId,
          },
          credentials,
        );
      } else {
        const organization = azureOrganizationName(credentials.organizationUrl);
        if (!organization)
          throw new Error('Не удалось определить организацию Azure DevOps.');
        const typeFields = await this.typeFields(
          project.externalId,
          settings.workItemType,
          credentials,
        );
        const operations = await this.createOperations(
          allocation,
          assignee,
          settings,
          typeFields,
          credentials,
          claimId,
        );
        // Record the attempt before POST so a lost response cannot trigger a second create.
        const recorded = await this.prisma.roadmapAllocation.updateMany({
          where: {
            ...owned,
            azureSyncStatus: 'sending',
            azureCreateAttemptId: null,
          },
          data: {
            azureCreateAttemptId: claimId,
            azureCreateOrganization: organization,
          },
        });
        if (!recorded.count) {
          await finish({
            azureSyncStatus: 'error',
            azureSyncError: 'Назначение изменилось во время отправки.',
          });
          return;
        }
        try {
          const created = await this.integration.requestJson<AzureWorkItem>(
            `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitems/$${encodeURIComponent(settings.workItemType)}?api-version=${this.apiVersion}`,
            {
              method: 'POST',
              body: JSON.stringify(operations),
              headers: { 'Content-Type': 'application/json-patch+json' },
              signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
            },
            credentials,
          );
          if (!Number.isSafeInteger(created?.id) || created.id <= 0)
            throw new Error(UNKNOWN_CREATE);
          taskId = String(created.id);
        } catch (error) {
          if (
            !(error instanceof AzureDevOpsHttpError) ||
            !CREATE_REJECTIONS.has(error.httpStatus)
          )
            throw new Error(UNKNOWN_CREATE);
          await this.prisma.roadmapAllocation.updateMany({
            where: owned,
            data: { azureCreateAttemptId: null, azureCreateOrganization: null },
          });
          throw error;
        }
      }
      if (
        allocation.azureCreateAttemptId ||
        taskId !== allocation.azureTaskId
      ) {
        const linked = await this.prisma.roadmapAllocation.updateMany({
          where: { ...owned, azureTaskId: allocation.azureTaskId },
          data: {
            azureTaskId: taskId,
            azureCreateAttemptId: null,
            azureCreateOrganization: null,
            azurePushedHours: null,
          },
        });
        if (!linked.count) {
          await finish({
            azureSyncStatus: 'error',
            azureSyncError:
              'Связь с задачей Azure DevOps изменилась во время отправки.',
          });
          return;
        }
      }
      await importWorkItemsRecorded(
        this.prisma,
        this.importer,
        project.id,
        [Number(taskId)],
        credentials,
      );
      await finish({
        azureSyncStatus: 'synced',
        azureSyncError: null,
        azureSyncedAt: new Date(),
        azurePushedHours: acceptedHours ?? estimate,
        ...(acceptedHours === null ? {} : { estimatedHours: acceptedHours }),
      });
      if (acceptedHours !== null)
        await this.shrinkPeriods(id, acceptedHours).catch(() => undefined);
      await refreshFeatureField();
    } catch (error) {
      await finish({
        azureSyncStatus: 'error',
        azureSyncError: this.message(error).slice(0, 1000),
      });
    }
  }

  private async findCreatedAllocationTask(
    projectExternalId: string,
    attemptId: string,
    credentials: AzureDevOpsCredentials,
  ) {
    const result = await this.integration.requestJson<{
      workItems: { id: number }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/wiql?$top=2&api-version=${this.apiVersion}`,
      {
        method: 'POST',
        body: JSON.stringify({
          query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '${this.createAttemptTag(attemptId)}'`,
        }),
        signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
      },
      credentials,
    );
    if (result.workItems.length !== 1) throw new Error(UNKNOWN_CREATE);
    return result.workItems[0].id;
  }

  private createAttemptTag(attemptId: string) {
    return `Roadmap-Create-${attemptId}`;
  }

  private async createOperations(
    allocation: AllocationWithContext,
    assignee: string,
    settings: WriteBackSettings,
    typeFields: Set<string>,
    credentials: AzureDevOpsCredentials,
    attemptId?: string,
  ) {
    const { workItem, role } = allocation;
    const project = workItem.project;
    const values = this.templateValues(allocation);
    const operations: PatchOperation[] = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value:
          renderWriteBackTemplate(settings.titleTemplate, values).slice(
            0,
            255,
          ) || workItem.title.slice(0, 255),
      },
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: `${credentials.organizationUrl}/_apis/wit/workItems/${workItem.externalId}`,
        },
      },
      ...this.estimateOperations(
        Number(allocation.estimatedHours),
        0,
        settings,
        typeFields,
        true,
      ),
    ];
    const tags = [
      ...renderWriteBackTags(settings.tagsTemplate, values),
      ...(attemptId ? [this.createAttemptTag(attemptId)] : []),
    ];
    if (tags.length)
      operations.push({
        op: 'add',
        path: '/fields/System.Tags',
        value: tags.join('; '),
      });
    if (settings.fields.assignedTo)
      operations.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: assignee,
      });
    if (settings.fields.description) {
      operations.push({
        op: 'add',
        path: '/fields/System.Description',
        value: `<p>Создано из Roadmap. Роль: ${escapeHtml(role.name)}, квартал: ${quarterLabel(allocation.quarterKey)}. Оценку и исполнителя меняйте в Roadmap — они перезаписываются при отправке плана. Фактическое время списывайте в Completed Work этой задачи.</p>`,
      });
    }
    if (settings.fields.areaPath) {
      const parent = await this.integration.requestJson<AzureWorkItem>(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(workItem.externalId)}?fields=System.AreaPath&api-version=${this.apiVersion}`,
        undefined,
        credentials,
      );
      if (typeof parent.fields['System.AreaPath'] === 'string') {
        operations.push({
          op: 'add',
          path: '/fields/System.AreaPath',
          value: parent.fields['System.AreaPath'],
        });
      }
    }
    let iterationPath: string | null = null;
    if (settings.fields.iteration) {
      const iteration = await this.quarterIterationPath(
        project.externalId,
        allocation.quarterKey,
        credentials,
      );
      if (iteration) {
        iterationPath = iteration;
        operations.push({
          op: 'add',
          path: '/fields/System.IterationPath',
          value: iteration,
        });
      }
    }
    if (settings.writeRules?.length) {
      const fieldInfo = new Map(
        [...typeFields].map((referenceName) => [
          referenceName,
          { referenceName },
        ]),
      );
      const evaluation = evaluateWriteRules(
        settings.writeRules,
        this.templateContext(allocation, assignee, iterationPath),
        fieldInfo,
        true,
      );
      for (const [targetField, value] of Object.entries(evaluation.values)) {
        if (
          !operations.some(
            (operation) => operation.path === `/fields/${targetField}`,
          )
        )
          operations.push({ op: 'add', path: `/fields/${targetField}`, value });
      }
    }
    return operations;
  }

  private async updateTask(
    initial: AzureWorkItem,
    input: {
      allocation: AllocationWithContext;
      assignee: string;
      estimate: number;
      estimateChanged: boolean;
      settings: WriteBackSettings;
      typeFields: Set<string>;
      projectExternalId: string;
    },
    credentials: AzureDevOpsCredentials,
  ) {
    // An allocation moved to another quarter takes its Task to that quarter's iteration.
    const iteration = input.settings.fields.iteration
      ? await this.iterationAfterQuarterMove(
          input.projectExternalId,
          input.allocation.quarterKey,
          initial.fields['System.IterationPath'],
          credentials,
        )
      : null;
    let task: AzureWorkItem | null = initial;
    for (let attempt = 0; attempt < 2 && task; attempt += 1) {
      const operations: PatchOperation[] = [];
      const assignedTo = task.fields['System.AssignedTo'] as
        { uniqueName?: string } | undefined;
      const completed = Number(task.fields[COMPLETED_WORK] ?? 0) || 0;
      if (
        input.settings.fields.assignedTo &&
        assignedTo?.uniqueName?.toLowerCase() !== input.assignee.toLowerCase()
      ) {
        operations.push({
          op: 'add',
          path: '/fields/System.AssignedTo',
          value: input.assignee,
        });
      }
      if (input.estimateChanged) {
        operations.push(
          ...this.estimateOperations(
            input.estimate,
            completed,
            input.settings,
            input.typeFields,
            false,
          ),
        );
      }
      if (iteration)
        operations.push({
          op: 'add',
          path: '/fields/System.IterationPath',
          value: iteration,
        });
      if (input.settings.writeRules?.length) {
        const fieldInfo = new Map(
          [...input.typeFields].map((referenceName) => [
            referenceName,
            { referenceName },
          ]),
        );
        // Assignee and estimates are diffed above; re-applying their rules would rewrite them on every push.
        const evaluation = evaluateWriteRules(
          input.settings.writeRules.filter(
            (rule) => !UPDATE_MANAGED_FIELDS.has(rule.targetField),
          ),
          this.templateContext(
            input.allocation,
            input.assignee,
            null,
            completed,
          ),
          fieldInfo,
          false,
        );
        for (const [targetField, value] of Object.entries(evaluation.values)) {
          if (
            !operations.some(
              (operation) => operation.path === `/fields/${targetField}`,
            )
          )
            operations.push({
              op: 'add',
              path: `/fields/${targetField}`,
              value,
            });
        }
      }
      if (!operations.length) return;
      try {
        // The revision check prevents overwriting Remaining Work computed from a stale Completed Work.
        await this.integration.request(
          `${credentials.organizationUrl}/_apis/wit/workitems/${task.id}?api-version=${this.apiVersion}`,
          {
            method: 'PATCH',
            body: JSON.stringify([
              { op: 'test', path: '/rev', value: task.rev },
              ...operations,
            ]),
            headers: { 'Content-Type': 'application/json-patch+json' },
            signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
          },
          credentials,
        );
        return;
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof AzureDevOpsHttpError &&
          [409, 412].includes(error.httpStatus)
        ) {
          task = await this.fetchTask(String(task.id), credentials);
          continue;
        }
        throw error;
      }
    }
  }

  private estimateOperations(
    estimate: number,
    completed: number,
    settings: WriteBackSettings,
    typeFields: Set<string>,
    creating: boolean,
  ): PatchOperation[] {
    const operations: PatchOperation[] = [];
    if (settings.fields.originalEstimate && typeFields.has(ORIGINAL_ESTIMATE)) {
      operations.push({
        op: 'add',
        path: `/fields/${ORIGINAL_ESTIMATE}`,
        value: estimate,
      });
    }
    if (
      settings.fields.remainingWork &&
      typeFields.has(REMAINING_WORK) &&
      (creating || settings.remainingWorkPolicy === 'recalculate')
    ) {
      operations.push({
        op: 'add',
        path: `/fields/${REMAINING_WORK}`,
        value: Math.max(0, estimate - completed),
      });
    }
    return operations;
  }

  private templateValues(
    allocation: AllocationWithContext,
  ): WriteBackTemplateValues {
    return {
      role: allocation.role.name,
      title: allocation.workItem.title,
      quarterKey: allocation.quarterKey,
      person: allocation.personName,
      id: allocation.workItem.externalId,
    };
  }

  private templateContext(
    allocation: AllocationWithContext,
    assignee: string,
    iterationPath: string | null,
    completed = 0,
  ): TemplateContext & {
    estimate: number;
    remaining: number;
    assignee: string;
    iterationPath: string | null;
    parentAreaPath: string | null;
  } {
    return {
      ...this.templateValues(allocation),
      personEmail: assignee,
      estimate: Number(allocation.estimatedHours),
      remaining: Math.max(0, Number(allocation.estimatedHours) - completed),
      assignee,
      iterationPath,
      parentAreaPath: null,
    };
  }

  /** Returns null when the task was deleted in Azure DevOps so it can be created again. */
  private async fetchTask(taskId: string, credentials: AzureDevOpsCredentials) {
    try {
      return await this.integration.requestJson<AzureWorkItem>(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(taskId)}?fields=System.AssignedTo,System.WorkItemType,System.IterationPath,${COMPLETED_WORK},${ORIGINAL_ESTIMATE}&api-version=${this.apiVersion}`,
        { signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS) },
        credentials,
      );
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError && error.httpStatus === 404)
        return null;
      throw error;
    }
  }

  /** Scheduling fields differ between processes (Agile/CMMI/Basic have Original Estimate, Scrum does not). */
  private async typeFields(
    projectExternalId: string,
    workItemType: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ) {
    const key = `${projectExternalId}:${workItemType.toLowerCase()}`;
    const cached = this.typeFieldCache.get(key);
    if (!fresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS)
      return cached.value;
    const result = await this.integration.requestJson<{
      value: { referenceName: string }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/fields?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    const value = new Set(result.value.map((field) => field.referenceName));
    this.typeFieldCache.set(key, { value, loadedAt: Date.now() });
    return value;
  }

  /**
   * Iteration to move a Task to after its allocation changed quarter, or null to leave it.
   * A Task already in the quarter (its node, a child node, or a sprint whose dates overlap the
   * quarter) stays where the team put it; only a Task in the project root or in another period moves.
   */
  private async iterationAfterQuarterMove(
    projectExternalId: string,
    quarterKey: string,
    currentValue: unknown,
    credentials: AzureDevOpsCredentials,
  ) {
    const target = await this.quarterIterationPath(
      projectExternalId,
      quarterKey,
      credentials,
    );
    const current = typeof currentValue === 'string' ? currentValue : '';
    if (!target) return null;
    const normalized = (path: string) => path.toLowerCase();
    if (
      normalized(current) === normalized(target) ||
      normalized(current).startsWith(`${normalized(target)}\\`)
    )
      return null;
    if (!current.includes('\\')) return target;
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    const root = this.iterationCache.get(projectExternalId)?.value;
    if (!match || !root) return null;
    const nodes: IterationNode[] = [];
    const visit = (node: IterationNode) => {
      nodes.push(node);
      node.children?.forEach(visit);
    };
    root.children?.forEach(visit);
    const node = nodes.find(
      (entry) =>
        entry.path &&
        normalized(
          entry.path.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, ''),
        ) === normalized(current),
    );
    const start = node?.attributes?.startDate;
    const finish = node?.attributes?.finishDate;
    // Without dates we cannot tell whether a sprint belongs to the quarter, so it is left alone.
    if (!start || !finish) return null;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
    const quarterEnd = Date.UTC(year, quarter * 3, 0, 23, 59, 59);
    const overlaps =
      Date.parse(start) <= quarterEnd && Date.parse(finish) >= quarterStart;
    return overlaps ? null : target;
  }

  private roleFieldName(
    settings: WriteBackSettings,
    role: { name: string; azureEstimateField: string | null },
  ) {
    return (
      settings.roleFields?.find((link) => link.roleName === role.name)
        ?.aggregateField ??
      role.azureEstimateField ??
      null
    );
  }

  /** The feature field that holds this role's hours, or null when the role has none. */
  private async featureRoleField(settings: WriteBackSettings, roleId: string) {
    const role = await this.prisma.roadmapRole.findUnique({
      where: { id: roleId },
      select: { name: true, azureEstimateField: true },
    });
    return role ? this.roleFieldName(settings, role) : null;
  }

  /** Re-writes the feature's role totals after an allocation was deleted; the role's field drops to 0 with its last one. */
  async refreshFeatureField(workItemId: string, roleId: string) {
    const settings = await this.integration
      .getWriteBackSettings()
      .catch(() => null);
    if (!settings || settings.mode === 'off') return;
    try {
      const item = await this.prisma.roadmapWorkItem.findUnique({
        where: { id: workItemId },
        select: { projectId: true },
      });
      if (!item) return;
      if (settings.projectIds && !settings.projectIds.includes(item.projectId))
        return;
      await this.writeFeatureAggregates(
        workItemId,
        settings,
        await this.integration.getCredentials(),
        { quick: true, zeroRoleIds: [roleId] },
      );
    } catch (error) {
      this.logger.warn(
        `Could not refresh role totals of work item ${workItemId}: ${this.message(error)}`,
      );
    }
  }

  /** "Создать задачу": the only way an allocation gets an Azure DevOps Task. */
  async createAllocationTask(actorId: string, allocationId: string) {
    const settings = await this.assertWriteBackEnabled(actorId);
    const allocation = await this.prisma.roadmapAllocation.findUnique({
      where: { id: allocationId },
      select: {
        azureTaskId: true,
        workItem: { select: { projectId: true, type: true } },
      },
    });
    if (!allocation)
      throw new NotFoundException('Roadmap allocation was not found');
    if (allocation.workItem.type.toLowerCase() === 'epic')
      throw new BadRequestException('На эпики нельзя назначать исполнителей.');
    if (allocation.azureTaskId)
      throw new ConflictException('Задача в Azure DevOps уже создана.');
    this.assertProjectAllowed(settings, allocation.workItem.projectId);
    const claimed = await this.prisma.roadmapAllocation.updateMany({
      where: { id: allocationId, azureSyncClaimId: null },
      data: { ...this.pendingUpdate, azureSyncRequested: true },
    });
    if (!claimed.count)
      throw new ConflictException(
        'Назначение сейчас отправляется в Azure DevOps. Повторите через минуту.',
      );
    await this.syncAllocation(allocationId, true);
    const result = await this.prisma.roadmapAllocation.findUnique({
      where: { id: allocationId },
      select: {
        azureTaskId: true,
        azureSyncStatus: true,
        azureSyncError: true,
      },
    });
    if (!result?.azureTaskId)
      throw new ConflictException(
        result?.azureSyncError ?? 'Не удалось создать задачу в Azure DevOps.',
      );
    return { taskId: result.azureTaskId };
  }

  /**
   * Writes the plan total of each role to the feature's role field in Azure DevOps
   * (the role's aggregate field from the field mapping, else its estimate field).
   */
  private async writeFeatureAggregates(
    workItemId: string,
    settings: WriteBackSettings,
    credentials: AzureDevOpsCredentials,
    options?: { quick?: boolean; zeroRoleIds?: string[] },
  ) {
    const item = await this.prisma.roadmapWorkItem.findUnique({
      where: { id: workItemId },
      select: {
        externalId: true,
        projectId: true,
        allocations: {
          select: {
            roleId: true,
            estimatedHours: true,
            personExternalId: true,
          },
        },
      },
    });
    if (!item) return;
    const roles = await this.prisma.roadmapRole.findMany({
      where: { projectId: item.projectId },
      select: { id: true, name: true, azureEstimateField: true },
    });
    // Demo participants are never sent to Azure DevOps, so their hours stay out of the totals.
    const mockPeople = new Set(
      (
        await this.prisma.roadmapPerson.findMany({
          where: {
            externalId: {
              in: item.allocations.map(
                (allocation) => allocation.personExternalId,
              ),
            },
            isMock: true,
          },
          select: { externalId: true },
        })
      ).map((person) => person.externalId),
    );
    const totals = new Map<string, number>();
    for (const role of roles) {
      const field = this.roleFieldName(settings, role);
      if (!field) continue;
      const roleAllocations = item.allocations
        .filter((allocation) => !mockPeople.has(allocation.personExternalId))
        .filter((allocation) => allocation.roleId === role.id);
      // A role without assignments may hold hours typed straight into the field: leave them alone.
      if (!roleAllocations.length && !options?.zeroRoleIds?.includes(role.id))
        continue;
      const hours = roleAllocations.reduce(
        (sum, allocation) => sum + Number(allocation.estimatedHours),
        0,
      );
      totals.set(field, (totals.get(field) ?? 0) + hours);
    }
    await this.writeFeatureFields(item, totals, credentials, {
      quick: options?.quick,
    });
  }

  /**
   * Hours typed into a role cell of a feature go to that role's field in Azure DevOps. People assigned
   * to the role exist only in Roadmap (for analytics): their hours are re-split so that they add up
   * to the typed total, and the field is then written from them.
   */
  async setRoleHours(
    actorId: string,
    workItemId: string,
    roleId: string,
    hours: number,
    quarterKey?: string,
  ) {
    const settings = await this.assertWriteBackEnabled(actorId);
    const item = await this.prisma.roadmapWorkItem.findUnique({
      where: { id: workItemId },
      select: {
        externalId: true,
        projectId: true,
        type: true,
        allocations: {
          where: { roleId },
          select: {
            id: true,
            quarterKey: true,
            personExternalId: true,
            estimatedHours: true,
            azureTaskId: true,
            azureCreateAttemptId: true,
            azureSyncClaimId: true,
            periods: { select: { id: true, hours: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Roadmap work item was not found');
    if (item.type.toLowerCase() !== 'feature')
      throw new BadRequestException('Часы роли задаются у фич.');
    this.assertProjectAllowed(settings, item.projectId);
    const role = await this.prisma.roadmapRole.findFirst({
      where: { id: roleId, projectId: item.projectId },
      select: { name: true, azureEstimateField: true },
    });
    const field = role ? this.roleFieldName(settings, role) : null;
    if (!field)
      throw new BadRequestException(
        'У роли нет поля оценки в Azure DevOps. Укажите его в настройках роли.',
      );
    const credentials = await this.integration.getCredentials();
    if (!item.allocations.length) {
      await this.writeFeatureFields(
        item,
        new Map([[field, hours]]),
        credentials,
        { quick: true },
      );
      return { field, hours };
    }

    if (!quarterKey)
      throw new BadRequestException(
        'Не указан квартал: у роли есть назначения, и часы делятся между ними внутри квартала.',
      );
    const current = item.allocations.filter(
      (allocation) => allocation.quarterKey === quarterKey,
    );
    if (!current.length)
      throw new ConflictException(
        'У роли есть часы в другом квартале. Измените их там или назначьте участника в этом квартале.',
      );
    if (current.some((allocation) => allocation.azureSyncClaimId))
      throw new ConflictException(
        'Назначение сейчас отправляется в Azure DevOps. Повторите через минуту.',
      );
    // Demo participants are never sent to Azure DevOps, so the typed total could not be written.
    const demoPeople = await this.prisma.roadmapPerson.findMany({
      where: {
        externalId: {
          in: current.map((allocation) => allocation.personExternalId),
        },
        isMock: true,
      },
      select: { externalId: true },
    });
    if (demoPeople.length)
      throw new BadRequestException(
        'В назначениях роли есть демо-участники: их часы не отправляются в Azure DevOps, поэтому общую сумму роли здесь изменить нельзя.',
      );
    // The cell shows the selected quarter, so the typed value is that quarter's total; the field
    // then gets the sum over all quarters, computed from the allocations below.
    const target = Math.round(hours * 100) / 100;
    const currentTotal = current.reduce(
      (sum, allocation) => sum + Number(allocation.estimatedHours),
      0,
    );
    let rest = target;
    const shares = current.map((allocation, index) => {
      const share =
        index === current.length - 1
          ? rest
          : Math.round(
              (currentTotal > 0
                ? (Number(allocation.estimatedHours) * target) / currentTotal
                : target / current.length) * 100,
            ) / 100;
      rest = Math.round((rest - share) * 100) / 100;
      return { allocation, hours: Math.max(0, share) };
    });
    await this.prisma.$transaction(async (tx) => {
      for (const { allocation, hours: share } of shares) {
        const hasTask = Boolean(
          allocation.azureTaskId || allocation.azureCreateAttemptId,
        );
        const updated = await tx.roadmapAllocation.updateMany({
          where: { id: allocation.id, azureSyncClaimId: null },
          data: {
            estimatedHours: share,
            // A linked Task is updated by the worker; without one the field is the whole sync,
            // and the row is marked synced only once the field has actually been written.
            ...this.pendingUpdate,
            ...(hasTask ? { azureSyncRequested: true } : {}),
          },
        });
        if (!updated.count)
          throw new ConflictException(
            'Назначение сейчас отправляется в Azure DevOps. Повторите через минуту.',
          );
        for (const period of scalePeriods(
          allocation.periods.map((row) => ({
            id: row.id,
            hours: Number(row.hours),
          })),
          share,
        ))
          await tx.roadmapPeriodAllocation.update({
            where: { id: period.id },
            data: { hours: period.hours },
          });
      }
    });
    const withTask = shares
      .filter(
        ({ allocation }) =>
          allocation.azureTaskId || allocation.azureCreateAttemptId,
      )
      .map(({ allocation }) => allocation.id);
    const fieldOnly = shares
      .map(({ allocation }) => allocation.id)
      .filter((id) => !withTask.includes(id));
    // Rows still "pending" are only those this call has not settled yet.
    const settleFieldOnly = async (
      data: Prisma.RoadmapAllocationUpdateInput,
    ) => {
      for (const id of fieldOnly)
        await this.prisma.roadmapAllocation.updateMany({
          where: { id, azureSyncClaimId: null, azureSyncStatus: 'pending' },
          data,
        });
    };
    try {
      await this.writeFeatureAggregates(workItemId, settings, credentials, {
        quick: true,
      });
    } catch (error) {
      // The plan already holds the new hours: show the rows as failed so they can be sent again.
      await settleFieldOnly({
        azureSyncStatus: 'error',
        azureSyncError:
          `Часы не записаны в поле роли у фичи: ${this.message(error)}`.slice(
            0,
            1000,
          ),
      });
      if (withTask.length) this.enqueue(withTask);
      throw error;
    }
    await settleFieldOnly({
      azureSyncStatus: 'synced',
      azureSyncError: null,
      azureSyncedAt: new Date(),
    });
    if (withTask.length) this.enqueue(withTask);
    return { field, hours };
  }

  /**
   * Sets feature fields in one PATCH, skipping values that already match. The stored copy of the
   * feature is then refreshed: by a full re-import, or (`quick`) by merging just the written values,
   * which is what a user typing into a cell waits for — the next webhook import confirms the rest.
   */
  private async writeFeatureFields(
    item: { externalId: string; projectId: string },
    totals: Map<string, number>,
    credentials: AzureDevOpsCredentials,
    { quick = false }: { quick?: boolean } = {},
  ) {
    if (!totals.size) return;
    for (let attempt = 0; ; attempt += 1) {
      const feature = await this.integration.requestJson<AzureWorkItem>(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(item.externalId)}?fields=${[...totals.keys()].map(encodeURIComponent).join(',')}&api-version=${this.apiVersion}`,
        { signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS) },
        credentials,
      );
      const written = [...totals]
        .map(
          ([field, hours]) => [field, Math.round(hours * 100) / 100] as const,
        )
        .filter(
          ([field, hours]) => hoursField(feature.fields[field]) !== hours,
        );
      if (!written.length) return;
      try {
        await this.integration.request(
          `${credentials.organizationUrl}/_apis/wit/workitems/${feature.id}?api-version=${this.apiVersion}`,
          {
            method: 'PATCH',
            body: JSON.stringify([
              { op: 'test', path: '/rev', value: feature.rev },
              ...written.map(([field, hours]) => ({
                op: 'add',
                path: `/fields/${field}`,
                value: hours,
              })),
            ]),
            headers: { 'Content-Type': 'application/json-patch+json' },
            signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
          },
          credentials,
        );
        if (quick) await this.mergeStoredFields(item, written);
        else
          await importWorkItemsRecorded(
            this.prisma,
            this.importer,
            item.projectId,
            [feature.id],
            credentials,
          );
        return;
      } catch (error) {
        // Someone edited the feature at the same moment: read it again and write on top.
        if (
          attempt === 0 &&
          error instanceof AzureDevOpsHttpError &&
          [409, 412].includes(error.httpStatus)
        )
          continue;
        throw error;
      }
    }
  }

  /** Puts just-written field values into the stored copy of the work item. */
  private async mergeStoredFields(
    item: { externalId: string; projectId: string },
    written: readonly (readonly [string, number])[],
  ) {
    const where = {
      projectId_externalId: {
        projectId: item.projectId,
        externalId: item.externalId,
      },
    };
    const stored = await this.prisma.roadmapWorkItem.findUnique({
      where,
      select: { azureCustomFields: true },
    });
    const current =
      stored?.azureCustomFields &&
      typeof stored.azureCustomFields === 'object' &&
      !Array.isArray(stored.azureCustomFields)
        ? stored.azureCustomFields
        : {};
    await this.prisma.roadmapWorkItem.update({
      where,
      data: {
        azureCustomFields: {
          ...current,
          ...Object.fromEntries(written),
        },
      },
    });
  }

  /** Keeps the monthly split within an estimate that Azure lowered. */
  private async shrinkPeriods(allocationId: string, estimate: number) {
    const periods = await this.prisma.roadmapPeriodAllocation.findMany({
      where: { allocationId },
      select: { id: true, hours: true },
    });
    const updates = scalePeriods(
      periods.map((period) => ({ id: period.id, hours: Number(period.hours) })),
      estimate,
    );
    for (const period of updates)
      await this.prisma.roadmapPeriodAllocation.update({
        where: { id: period.id },
        data: { hours: period.hours },
      });
  }

  /**
   * The quarter's iteration for the plan filter, by the same rule Task write-back uses.
   * Null when the integration is off or Azure cannot answer: the plan then shows every card.
   */
  async findQuarterIteration(
    projectId: string,
    quarterKey: string,
  ): Promise<{ iterationPath: string | null }> {
    if (typeof quarterKey !== 'string' || !/^\d{4}-Q[1-4]$/.test(quarterKey)) {
      throw new BadRequestException('Quarter must use YYYY-Qn format');
    }
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    try {
      if (!(await this.integration.getPublicSettings()).configured)
        return { iterationPath: null };
      const credentials = await this.integration.getCredentials();
      return {
        iterationPath: await this.quarterIterationPath(
          project.externalId,
          quarterKey,
          credentials,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Quarter iteration lookup failed for project ${projectId}: ${this.message(error)}`,
      );
      return { iterationPath: null };
    }
  }

  /** Finds the iteration for a `YYYY-Qn` quarter: by name first, then the narrowest one spanning the quarter. */
  private async quarterIterationPath(
    projectExternalId: string,
    quarterKey: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ) {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!match) return null;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
    const quarterEnd = Date.UTC(year, quarter * 3, 0);

    let cached = this.iterationCache.get(projectExternalId);
    if (fresh || !cached || Date.now() - cached.loadedAt >= CACHE_TTL_MS) {
      const root = await this.integration
        .requestJson<IterationNode>(
          `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=${this.apiVersion}`,
          undefined,
          credentials,
        )
        .catch(() => null);
      cached = { value: root, loadedAt: Date.now() };
      this.iterationCache.set(projectExternalId, cached);
    }
    if (!cached.value) return null;

    const nodes: IterationNode[] = [];
    const visit = (node: IterationNode) => {
      nodes.push(node);
      node.children?.forEach(visit);
    };
    cached.value.children?.forEach(visit);
    const namePattern = new RegExp(
      `(^|\\D)(${year}\\W*Q${quarter}|Q${quarter}\\W*${year})(\\D|$)`,
      'i',
    );
    const day = (value: string) => {
      const date = new Date(value);
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      );
    };
    const byName = nodes.find((node) =>
      namePattern.test(node.path ?? node.name),
    );
    const spanning = nodes
      .filter(
        (node) =>
          node.attributes?.startDate &&
          node.attributes.finishDate &&
          day(node.attributes.startDate) <= quarterStart &&
          day(node.attributes.finishDate) >= quarterEnd,
      )
      .sort(
        (left, right) =>
          day(left.attributes!.finishDate!) -
          day(left.attributes!.startDate!) -
          (day(right.attributes!.finishDate!) -
            day(right.attributes!.startDate!)),
      );
    const node = byName ?? spanning[0];
    // Classification paths look like "\Project\Iteration\2026\Q4"; work items use "Project\2026\Q4".
    return node?.path
      ? node.path.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, '')
      : null;
  }

  private async flushWebhookImports() {
    this.importTimer = null;
    const batches = [...this.pendingImports.entries()];
    this.pendingImports.clear();
    for (const [projectId, ids] of batches) {
      try {
        const credentials = await this.integration.getCredentials();
        await importWorkItemsRecorded(
          this.prisma,
          this.importer,
          projectId,
          [...ids],
          credentials,
        );
      } catch (error) {
        this.logger.error(
          `Azure DevOps webhook import failed for project ${projectId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  private async handleDeletedWorkItem(projectId: string, externalId: string) {
    await this.prisma.roadmapAllocation.updateMany({
      where: { azureTaskId: externalId, workItem: { projectId } },
      data: {
        azureTaskId: null,
        azurePushedHours: null,
        azureSyncStatus: 'error',
        azureSyncError:
          'Задача удалена в Azure DevOps. Нажмите «Отправить снова», чтобы создать её заново.',
      },
    });
    const local = await this.prisma.roadmapWorkItem.findUnique({
      where: { projectId_externalId: { projectId, externalId } },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (!local) return;
    // Planned work keeps its allocations; only items without a plan are removed.
    if (local._count.allocations) {
      await this.prisma.roadmapWorkItem.update({
        where: { id: local.id },
        data: { state: 'Deleted' },
      });
    } else {
      await this.prisma.roadmapWorkItem.delete({ where: { id: local.id } });
    }
  }

  private async peopleByExternalId(externalIds: string[]) {
    const people = await this.prisma.roadmapPerson.findMany({
      where: { externalId: { in: [...new Set(externalIds)] } },
      select: { externalId: true, email: true, isMock: true },
    });
    return new Map(people.map((person) => [person.externalId, person]));
  }

  private message(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Не удалось выполнить запрос к Azure DevOps';
  }

  private assertProjectAllowed(settings: WriteBackSettings, projectId: string) {
    if (settings.projectIds && !settings.projectIds.includes(projectId)) {
      throw new BadRequestException(
        'Этот проект не включён в запись плана. Добавьте его в настройках интеграции.',
      );
    }
  }

  async canManuallyPush(
    actorId: string,
    settings: WriteBackSettings,
  ): Promise<boolean> {
    return (
      Boolean(actorId) &&
      (settings.pushPermission !== 'admins' ||
        (await this.isActiveAdmin.execute(actorId)))
    );
  }

  private async assertCanManuallyPush(
    actorId: string,
    settings: WriteBackSettings,
  ) {
    if (!(await this.canManuallyPush(actorId, settings))) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'Отправка плана в Azure DevOps доступна только администраторам.',
        },
      });
    }
  }

  private async assertWriteBackEnabled(actorId: string) {
    const settings = await this.integration.getWriteBackSettings();
    await this.assertCanManuallyPush(actorId, settings);
    if (settings.mode === 'off') {
      throw new BadRequestException(
        'Запись плана в Azure DevOps выключена. Включите её в администрировании Roadmap → Интеграции.',
      );
    }
    return settings;
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}
