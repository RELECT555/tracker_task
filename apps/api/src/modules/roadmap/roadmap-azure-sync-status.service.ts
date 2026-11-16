import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  AzureDevOpsCredentials,
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import {
  quarterLabel,
  renderWriteBackTemplate,
} from './roadmap-write-back.settings';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapAzureTaskService } from './roadmap-azure-task.service';
import { RoadmapAzureFeatureFieldsService } from './roadmap-azure-feature-fields.service';
import { RoadmapWriteBackAccessService } from './roadmap-write-back-access.service';
import {
  allocationContext,
  azureErrorMessage,
  COMPLETED_WORK,
  nonEpicWorkItem,
  ORIGINAL_ESTIMATE,
  REMAINING_WORK,
} from './roadmap-azure-sync.shared';

export type ReadinessCheck = {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
};

export function worstReadinessStatus(
  checks: ReadinessCheck[] | null,
): ReadinessCheck['status'] | null {
  if (!checks?.length) return null;
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'ok';
}

/** Write-back health for the integration page: preview, per-project status and the readiness check. */
@Injectable()
export class RoadmapAzureSyncStatusService {
  private readonly apiVersion = '7.1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly access: RoadmapWriteBackAccessService,
    private readonly azureProcess: RoadmapAzureProcessService,
    private readonly tasks: RoadmapAzureTaskService,
    private readonly featureFields: RoadmapAzureFeatureFieldsService,
  ) {}

  /** What "Send to Azure" would do, computed locally without calling Azure DevOps. */
  async previewProject(actorId: string, projectId: string) {
    const settings = await this.integration.getWriteBackSettings();
    await this.access.assertCanManuallyPush(actorId, settings);
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
      const roleField = this.featureFields.roleFieldName(
        settings,
        allocation.role,
      );
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
        detail: azureErrorMessage(error),
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
      typeFields = await this.azureProcess.typeFields(
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
        detail: azureErrorMessage(error),
      });
    }

    const now = new Date();
    const currentQuarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    if (settings.fields.iteration) {
      const iteration = await this.azureProcess.quarterIterationPath(
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
          ? await this.tasks.createOperations(
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
            ? `Azure DevOps принял бы задачу «${renderWriteBackTemplate(settings.titleTemplate, this.tasks.templateValues(sample))}» для ${sample.personName}`
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
            : azureErrorMessage(error),
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

  private async peopleByExternalId(externalIds: string[]) {
    const people = await this.prisma.roadmapPerson.findMany({
      where: { externalId: { in: [...new Set(externalIds)] } },
      select: { externalId: true, email: true, isMock: true },
    });
    return new Map(people.map((person) => [person.externalId, person]));
  }
}
