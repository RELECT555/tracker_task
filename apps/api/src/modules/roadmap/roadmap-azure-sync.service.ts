import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
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
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapAzureTaskService } from './roadmap-azure-task.service';
import { RoadmapAzureFeatureFieldsService } from './roadmap-azure-feature-fields.service';
import { RoadmapWriteBackAccessService } from './roadmap-write-back-access.service';
import {
  allocationContext,
  azureErrorMessage,
  CREATE_REJECTIONS,
  nonEpicWorkItem,
  ORIGINAL_ESTIMATE,
  SYNC_REQUEST_TIMEOUT_MS,
  UNKNOWN_CREATE,
} from './roadmap-azure-sync.shared';

const SYNC_CLAIM_MS = 5 * 60_000;

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
    private readonly allocationAzure: RoadmapAllocationAzureService,
    private readonly access: RoadmapWriteBackAccessService,
    private readonly azureProcess: RoadmapAzureProcessService,
    private readonly tasks: RoadmapAzureTaskService,
    private readonly featureFields: RoadmapAzureFeatureFieldsService,
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
    const settings = await this.access.assertWriteBackEnabled(actorId);
    this.access.assertProjectAllowed(settings, projectId);
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
    const settings = await this.access.assertWriteBackEnabled(actorId);
    const allocation = await this.prisma.roadmapAllocation.findUnique({
      where: { id: allocationId },
      select: { workItem: { select: { projectId: true, type: true } } },
    });
    if (!allocation)
      throw new NotFoundException('Roadmap allocation was not found');
    if (allocation.workItem.type.toLowerCase() === 'epic')
      throw new BadRequestException('На эпики нельзя назначать исполнителей.');
    this.access.assertProjectAllowed(settings, allocation.workItem.projectId);
    const result = await this.prisma.roadmapAllocation.updateMany({
      where: { id: allocationId, azureSyncClaimId: null },
      data: { ...this.pendingUpdate, azureSyncRequested: true },
    });
    if (result.count) this.enqueue([allocationId]);
    return { queued: result.count };
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

  private enqueue(allocationIds: string[]) {
    allocationIds.forEach((id) => this.queue.add(id));
    this.kick();
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
        if (
          !(await this.featureFields.featureRoleField(
            settings,
            allocation.roleId,
          ))
        ) {
          await finish({
            azureSyncStatus: 'skipped',
            azureSyncError:
              'У роли нет поля оценки в Azure DevOps — часы остаются только в плане.',
          });
          return;
        }
        await this.featureFields.writeFeatureAggregates(
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
          await this.featureFields.writeFeatureAggregates(
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
                `Часы не записаны в поле роли у фичи: ${azureErrorMessage(error)}`.slice(
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
        const recovered = await this.tasks.findCreatedAllocationTask(
          project.externalId,
          allocation.azureCreateAttemptId,
          credentials,
        );
        existing = await this.tasks.fetchTask(String(recovered), credentials);
        if (!existing) throw new Error(UNKNOWN_CREATE);
        taskId = String(existing.id);
      } else if (taskId) {
        existing = await this.tasks.fetchTask(taskId, credentials);
      }
      if (existing) {
        const existingType = existing.fields['System.WorkItemType'];
        const typeName =
          typeof existingType === 'string'
            ? existingType
            : settings.workItemType;
        const typeFields = await this.azureProcess.typeFields(
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
        await this.tasks.updateTask(
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
        const typeFields = await this.azureProcess.typeFields(
          project.externalId,
          settings.workItemType,
          credentials,
        );
        const operations = await this.tasks.createOperations(
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
        azureSyncError: azureErrorMessage(error).slice(0, 1000),
      });
    }
  }

  /** "Создать задачу": the only way an allocation gets an Azure DevOps Task. */
  async createAllocationTask(actorId: string, allocationId: string) {
    const settings = await this.access.assertWriteBackEnabled(actorId);
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
    this.access.assertProjectAllowed(settings, allocation.workItem.projectId);
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
    const settings = await this.access.assertWriteBackEnabled(actorId);
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
    this.access.assertProjectAllowed(settings, item.projectId);
    const role = await this.prisma.roadmapRole.findFirst({
      where: { id: roleId, projectId: item.projectId },
      select: { name: true, azureEstimateField: true },
    });
    const field = role
      ? this.featureFields.roleFieldName(settings, role)
      : null;
    if (!field)
      throw new BadRequestException(
        'У роли нет поля оценки в Azure DevOps. Укажите его в настройках роли.',
      );
    const credentials = await this.integration.getCredentials();
    if (!item.allocations.length) {
      await this.featureFields.writeFeatureFields(
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
      await this.featureFields.writeFeatureAggregates(
        workItemId,
        settings,
        credentials,
        {
          quick: true,
        },
      );
    } catch (error) {
      // The plan already holds the new hours: show the rows as failed so they can be sent again.
      await settleFieldOnly({
        azureSyncStatus: 'error',
        azureSyncError:
          `Часы не записаны в поле роли у фичи: ${azureErrorMessage(error)}`.slice(
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
}
