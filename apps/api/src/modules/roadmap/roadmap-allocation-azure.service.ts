import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import { escapeHtml } from './azure-html';
import { importWorkItemsRecorded } from './roadmap-import-health';
import {
  decideEstimate,
  hoursField,
  identityEmail,
  identityName,
  scalePeriods,
  type ConflictPolicy,
} from './roadmap-allocation-reconcile';
import {
  AzureDevOpsCredentials,
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import {
  AzureWorkItem,
  RoadmapWorkItemImportService,
} from './roadmap-work-item-import.service';
import type { PlanChangeContext } from './roadmap-plan-change';
import { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import type { WriteBackSettings } from './roadmap-write-back.settings';

const API = '7.1';
const ORIGINAL_ESTIMATE = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
const REMAINING_WORK = 'Microsoft.VSTS.Scheduling.RemainingWork';
const COMPLETED_WORK = 'Microsoft.VSTS.Scheduling.CompletedWork';
const ASSIGNED_TO = 'System.AssignedTo';

const allocationWithContext = {
  role: { select: { name: true } },
  periods: { select: { id: true, hours: true } },
  workItem: {
    select: {
      projectId: true,
      project: { select: { externalId: true } },
    },
  },
} as const;
type AllocationWithContext = Prisma.RoadmapAllocationGetPayload<{
  include: typeof allocationWithContext;
}>;

export type RemovalPolicy = NonNullable<WriteBackSettings['removalPolicy']>;
type Actor = { id: string; email: string };

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The Azure → Roadmap half of the allocation sync, plus actions that write to a Task on someone's
 * behalf: taking Task edits back into the plan, logging time, and removing a Task by policy.
 */
@Injectable()
export class RoadmapAllocationAzureService implements OnModuleInit {
  private readonly logger = new Logger(RoadmapAllocationAzureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
    private readonly isActiveAdmin: IsActiveAdminHandler,
    private readonly planChanges: RoadmapPlanChangeService,
  ) {}

  onModuleInit() {
    this.importer.onImported((projectId, items) =>
      this.reconcile(projectId, items),
    );
  }

  /**
   * Runs after every import (webhook, 5-minute poll, manual sync): edits made in Azure to a Task
   * that mirrors an allocation — Original Estimate and assignee — flow back into the plan.
   */
  async reconcile(projectId: string, items: AzureWorkItem[]) {
    const tasks = new Map(items.map((item) => [String(item.id), item]));
    if (!tasks.size) return;
    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: {
        azureTaskId: { in: [...tasks.keys()] },
        workItem: { projectId },
        // A worker is writing this row to Azure right now; its own import must not undo it.
        azureSyncClaimId: null,
      },
      include: allocationWithContext,
    });
    if (!allocations.length) return;
    const settings = await this.integration.getWriteBackSettings();
    for (const allocation of allocations) {
      await this.applyAzure(
        allocation,
        tasks.get(allocation.azureTaskId!)!,
        settings.conflictPolicy ?? 'overwrite',
        false,
      ).catch((error: unknown) =>
        this.logger.error(
          `Could not take Azure DevOps changes into allocation ${allocation.id}`,
          error instanceof Error ? error.stack : error,
        ),
      );
    }
  }

  /** "Принять из Azure": the Task's estimate and assignee replace the plan's values. */
  async acceptFromAzure(allocationId: string) {
    const allocation = await this.allocation(allocationId);
    if (!allocation.azureTaskId)
      throw new ConflictException('Задача в Azure DevOps ещё не создана.');
    const credentials = await this.integration.getCredentials();
    const task = await this.fetchTask(allocation.azureTaskId, credentials);
    const result = await this.applyAzure(allocation, task, 'skip-field', true);
    if (result.conflicts.length)
      throw new ConflictException(result.conflicts.join(' '));
    return { accepted: true };
  }

  /** Adds hours to the Task's Completed Work (and takes them off Remaining Work). */
  async logTime(
    actor: Actor,
    allocationId: string,
    hours: number,
    comment: string | undefined,
    canEditProject: boolean,
  ) {
    const allocation = await this.allocation(allocationId);
    const settings = await this.integration.getWriteBackSettings();
    if (settings.mode === 'off')
      throw new ForbiddenException(
        'Запись в Azure DevOps выключена в настройках интеграции.',
      );
    const isAssignee =
      Boolean(allocation.personEmail) &&
      allocation.personEmail!.toLowerCase() === actor.email.toLowerCase();
    if (
      !isAssignee &&
      !(canEditProject && (await this.canPush(actor.id, settings)))
    )
      throw new ForbiddenException(
        'Списывать время может исполнитель или планировщик проекта.',
      );
    if (!allocation.azureTaskId)
      throw new ConflictException(
        'Задача в Azure DevOps ещё не создана — сначала отправьте назначение.',
      );

    const credentials = await this.integration.getCredentials();
    const note = `<div><i>Списано ${round(hours)} ч в Roadmap: ${escapeHtml(await this.actorName(actor))}${comment?.trim() ? ` — ${escapeHtml(comment.trim())}` : ''}</i></div>`;
    for (let attempt = 0; ; attempt += 1) {
      const task = await this.fetchTask(allocation.azureTaskId, credentials);
      const completed = hoursField(task.fields[COMPLETED_WORK]) ?? 0;
      const remaining = hoursField(task.fields[REMAINING_WORK]);
      const operations = [
        { op: 'test', path: '/rev', value: task.rev },
        {
          op: 'add',
          path: `/fields/${COMPLETED_WORK}`,
          value: round(completed + hours),
        },
        ...(remaining === null
          ? []
          : [
              {
                op: 'add',
                path: `/fields/${REMAINING_WORK}`,
                value: round(Math.max(0, remaining - hours)),
              },
            ]),
        { op: 'add', path: '/fields/System.History', value: note },
      ];
      try {
        await this.integration.request(
          `${credentials.organizationUrl}/_apis/wit/workitems/${task.id}?api-version=${API}`,
          {
            method: 'PATCH',
            body: JSON.stringify(operations),
            headers: { 'Content-Type': 'application/json-patch+json' },
          },
          credentials,
        );
        break;
      } catch (error) {
        // Someone logged time at the same moment: re-read and add on top of their value.
        if (
          attempt === 0 &&
          error instanceof AzureDevOpsHttpError &&
          [409, 412].includes(error.httpStatus)
        )
          continue;
        throw error;
      }
    }
    await importWorkItemsRecorded(
      this.prisma,
      this.importer,
      allocation.workItem.projectId,
      [Number(allocation.azureTaskId)],
      credentials,
    );
    const task = await this.prisma.roadmapWorkItem.findUnique({
      where: {
        projectId_externalId: {
          projectId: allocation.workItem.projectId,
          externalId: allocation.azureTaskId,
        },
      },
      select: { actualHours: true },
    });
    return {
      actualHours:
        task?.actualHours === null || !task ? null : Number(task.actualHours),
    };
  }

  /** Deletes an allocation; its Task is kept, moved to a state, or deleted as the policy says. */
  async deleteAllocation(
    actor: Actor,
    allocationId: string,
    context: PlanChangeContext,
  ) {
    const allocation = await this.allocation(allocationId);
    if (allocation.azureSyncClaimId)
      throw new ConflictException(
        'Назначение сейчас отправляется в Azure DevOps. Повторите через минуту.',
      );
    // Read before the Task is touched: what the plan held is what the log keeps.
    const before = (
      await this.planChanges.read(this.prisma, [allocationId])
    ).get(allocationId);
    const settings = await this.integration.getWriteBackSettings();
    let task: 'kept' | 'state' | 'deleted' | null = null;
    if (allocation.azureTaskId && settings.mode !== 'off') {
      task = await this.applyRemoval(
        allocation.workItem.project.externalId,
        allocation.azureTaskId,
        settings.removalPolicy ?? { action: 'keep' },
        await this.integration.getCredentials(),
        await this.actorName(actor),
      );
    }
    // The Task in Azure has already been handled; the row and its log entry go together.
    await this.prisma.$transaction(async (tx) => {
      await tx.roadmapAllocation.delete({ where: { id: allocationId } });
      if (before)
        await this.planChanges.record(tx, context, [
          {
            ref: before.ref,
            before: before.snapshot,
            after: null,
            details: { task },
          },
        ]);
    });
    return {
      deleted: true,
      task,
      workItemId: allocation.workItemId,
      roleId: allocation.roleId,
    };
  }

  /** Applies the removal policy to a Task whose allocation was deleted or set to zero hours. */
  async applyRemoval(
    projectExternalId: string,
    taskId: string,
    policy: RemovalPolicy,
    credentials: AzureDevOpsCredentials,
    actorName = 'Roadmap',
  ): Promise<'kept' | 'state' | 'deleted'> {
    if (policy.action === 'keep') return 'kept';
    try {
      if (policy.action === 'delete') {
        // Without destroy=true the Task goes to the Azure DevOps recycle bin and can be restored.
        await this.integration.request(
          `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/workitems/${encodeURIComponent(taskId)}?api-version=${API}`,
          { method: 'DELETE' },
          credentials,
        );
        return 'deleted';
      }
      await this.integration.request(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(taskId)}?api-version=${API}`,
        {
          method: 'PATCH',
          body: JSON.stringify([
            {
              op: 'add',
              path: '/fields/System.State',
              value: policy.state?.trim() || 'Removed',
            },
            {
              op: 'add',
              path: '/fields/System.History',
              value: `<div><i>Назначение снято в Roadmap: ${escapeHtml(actorName)}</i></div>`,
            },
          ]),
          headers: { 'Content-Type': 'application/json-patch+json' },
        },
        credentials,
      );
      return 'state';
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError && error.httpStatus === 404)
        return policy.action === 'delete' ? 'deleted' : 'kept';
      if (error instanceof AzureDevOpsHttpError && error.httpStatus === 400)
        throw new ConflictException(
          `Azure DevOps не принял состояние «${policy.state || 'Removed'}» для задачи. Проверьте политику снятия назначения в настройках интеграции.`,
        );
      throw error;
    }
  }

  private async applyAzure(
    allocation: AllocationWithContext,
    task: AzureWorkItem,
    policy: ConflictPolicy,
    force: boolean,
  ): Promise<{ changed: boolean; conflicts: string[] }> {
    const data: Prisma.RoadmapAllocationUncheckedUpdateManyInput = {};
    const conflicts: string[] = [];
    let periodUpdates: { id: string; hours: number }[] = [];

    const azureHours = hoursField(task.fields[ORIGINAL_ESTIMATE]);
    const decision = force
      ? azureHours === null
        ? ({ action: 'none' } as const)
        : ({ action: 'accept', hours: azureHours } as const)
      : decideEstimate({
          azure: azureHours,
          pushed:
            allocation.azurePushedHours === null
              ? null
              : Number(allocation.azurePushedHours),
          planned: Number(allocation.estimatedHours),
          policy,
        });
    if (decision.action === 'accept') {
      if (Number(allocation.estimatedHours) !== decision.hours)
        data.estimatedHours = decision.hours;
      data.azurePushedHours = decision.hours;
      periodUpdates = scalePeriods(
        allocation.periods.map((period) => ({
          id: period.id,
          hours: Number(period.hours),
        })),
        decision.hours,
      );
    } else if (decision.action === 'conflict') {
      conflicts.push(decision.message);
    }

    // The assignee has no "last pushed" value, so only a row with no unsent Roadmap edit is compared.
    const settled =
      force ||
      allocation.azureSyncStatus === 'synced' ||
      allocation.azureSyncStatus === 'conflict';
    const azureEmail = identityEmail(task.fields[ASSIGNED_TO]);
    if (
      settled &&
      azureEmail !== (allocation.personEmail?.toLowerCase() ?? null)
    ) {
      if (!azureEmail) {
        conflicts.push('В Azure DevOps у задачи сняли исполнителя.');
      } else {
        const outcome = await this.assigneeFromAzure(
          allocation,
          azureEmail,
          identityName(task.fields[ASSIGNED_TO]),
        );
        if ('conflict' in outcome) conflicts.push(outcome.conflict);
        else Object.assign(data, outcome.data);
      }
    }

    if (conflicts.length) {
      Object.assign(data, {
        azureSyncStatus: 'conflict',
        azureSyncError: conflicts.join(' ').slice(0, 1000),
        azureSyncRequested: false,
      });
    } else if (force || allocation.azureSyncStatus === 'conflict') {
      Object.assign(data, { azureSyncStatus: 'synced', azureSyncError: null });
    }
    if (!Object.keys(data).length && !periodUpdates.length)
      return { changed: false, conflicts };
    if (
      data.estimatedHours !== undefined ||
      data.personExternalId !== undefined
    )
      data.azureSyncedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Skip if a plan edit or a push touched the row since it was read.
      const updated = await tx.roadmapAllocation.updateMany({
        where: {
          id: allocation.id,
          updatedAt: allocation.updatedAt,
          azureSyncClaimId: null,
        },
        data,
      });
      if (!updated.count) return;
      for (const period of periodUpdates)
        await tx.roadmapPeriodAllocation.update({
          where: { id: period.id },
          data: { hours: period.hours },
        });
    });
    return { changed: true, conflicts };
  }

  private async assigneeFromAzure(
    allocation: AllocationWithContext,
    email: string,
    displayName: string | null,
  ): Promise<
    | { data: Prisma.RoadmapAllocationUncheckedUpdateManyInput }
    | { conflict: string }
  > {
    const person = await this.prisma.roadmapPerson.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
      select: { id: true, externalId: true, name: true, email: true },
    });
    const label = person?.name ?? displayName ?? email;
    if (!person)
      return {
        conflict: `В Azure DevOps исполнитель — ${label}, но его нет среди участников Roadmap.`,
      };
    const member = await this.prisma.roadmapRoleMember.findFirst({
      where: { roleId: allocation.roleId, personId: person.id },
      select: { id: true },
    });
    if (!member)
      return {
        conflict: `В Azure DevOps исполнитель — ${label}, но он не входит в роль «${allocation.role.name}».`,
      };
    const duplicate = await this.prisma.roadmapAllocation.findFirst({
      where: {
        workItemId: allocation.workItemId,
        roleId: allocation.roleId,
        personExternalId: person.externalId,
        quarterKey: allocation.quarterKey,
        id: { not: allocation.id },
      },
      select: { id: true },
    });
    if (duplicate)
      return {
        conflict: `В Azure DevOps исполнитель — ${label}, но у него уже есть своя оценка по этой роли в этом квартале.`,
      };
    return {
      data: {
        personExternalId: person.externalId,
        personName: person.name,
        personEmail: person.email,
      },
    };
  }

  private async allocation(id: string) {
    const allocation = await this.prisma.roadmapAllocation.findUnique({
      where: { id },
      include: allocationWithContext,
    });
    if (!allocation) throw new NotFoundException('Назначение не найдено');
    return allocation;
  }

  private async fetchTask(taskId: string, credentials: AzureDevOpsCredentials) {
    try {
      return await this.integration.requestJson<AzureWorkItem>(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(taskId)}?fields=${[ORIGINAL_ESTIMATE, REMAINING_WORK, COMPLETED_WORK, ASSIGNED_TO].join(',')}&api-version=${API}`,
        undefined,
        credentials,
      );
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError && error.httpStatus === 404)
        throw new ConflictException(
          'Задача удалена в Azure DevOps. Отправьте назначение снова, чтобы создать её.',
        );
      throw error;
    }
  }

  private async canPush(actorId: string, settings: WriteBackSettings) {
    return (
      settings.pushPermission !== 'admins' ||
      (await this.isActiveAdmin.execute(actorId))
    );
  }

  private async actorName(actor: Actor) {
    const user = await this.prisma.user
      .findUnique({ where: { id: actor.id }, select: { fullName: true } })
      .catch(() => null);
    return user?.fullName || actor.email;
  }
}
