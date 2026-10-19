import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { AzureDevOpsCredentials, AzureDevOpsHttpError, RoadmapIntegrationService } from './roadmap-integration.service';
import { AzureWorkItem, RoadmapWorkItemImportService } from './roadmap-work-item-import.service';
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
type PatchOperation = { op: 'add' | 'replace' | 'test'; path: string; value: unknown };
type CacheEntry<T> = { value: T; loadedAt: number };
type AllocationWithContext = Prisma.RoadmapAllocationGetPayload<{
  include: { role: true; workItem: { include: { project: true } } };
}>;
type ReadinessCheck = { key: string; label: string; status: 'ok' | 'warning' | 'error'; detail: string };

export type AzureWebhookPayload = {
  eventType?: string;
  resource?: { id?: number; workItemId?: number };
  resourceContainers?: { project?: { id?: string } };
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_DEBOUNCE_MS = 1500;
const ORIGINAL_ESTIMATE = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
const REMAINING_WORK = 'Microsoft.VSTS.Scheduling.RemainingWork';
const COMPLETED_WORK = 'Microsoft.VSTS.Scheduling.CompletedWork';
const allocationContext = { role: true, workItem: { include: { project: true } } } as const;

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
  private readonly iterationCache = new Map<string, CacheEntry<IterationNode | null>>();
  private readonly pendingImports = new Map<string, Set<number>>();
  private importTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
  ) {}

  /** Status written by plan edits: the allocation must be sent to Azure DevOps again. */
  readonly pendingUpdate = { azureSyncStatus: 'pending', azureSyncError: null } satisfies Prisma.RoadmapAllocationUpdateInput;

  /** Called after a plan edit; only automatic mode sends right away. */
  async onAllocationSaved(allocationId: string) {
    const settings = await this.integration.getWriteBackSettings().catch(() => null);
    if (settings?.mode === 'auto') this.enqueue([allocationId]);
  }

  /** Sends every assignment of the project that is not synced yet, or only the selected ones. */
  async pushProject(projectId: string, allocationIds?: string[]) {
    const settings = await this.assertWriteBackEnabled();
    this.assertProjectAllowed(settings, projectId);
    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: {
        workItem: { projectId },
        ...(allocationIds?.length
          ? { id: { in: allocationIds } }
          : { OR: [{ azureSyncStatus: null }, { azureSyncStatus: { not: 'synced' } }] }),
      },
      select: { id: true },
    });
    const ids = allocations.map((allocation) => allocation.id);
    if (ids.length) {
      await this.prisma.roadmapAllocation.updateMany({ where: { id: { in: ids } }, data: this.pendingUpdate });
      this.enqueue(ids);
    }
    return { queued: ids.length };
  }

  async pushAllocation(allocationId: string) {
    const settings = await this.assertWriteBackEnabled();
    const allocation = await this.prisma.roadmapAllocation.findUnique({ where: { id: allocationId }, select: { workItem: { select: { projectId: true } } } });
    if (!allocation) throw new NotFoundException('Roadmap allocation was not found');
    this.assertProjectAllowed(settings, allocation.workItem.projectId);
    await this.prisma.roadmapAllocation.update({ where: { id: allocationId }, data: this.pendingUpdate });
    this.enqueue([allocationId]);
    return { queued: 1 };
  }

  /** What "Send to Azure" would do, computed locally without calling Azure DevOps. */
  async previewProject(projectId: string) {
    const settings = await this.integration.getWriteBackSettings();
    const allocations = await this.prisma.roadmapAllocation.findMany({
      where: { workItem: { projectId }, OR: [{ azureSyncStatus: null }, { azureSyncStatus: { not: 'synced' } }] },
      include: allocationContext,
      orderBy: [{ quarterKey: 'asc' }, { personName: 'asc' }],
    });
    const people = await this.peopleByExternalId(allocations.map((allocation) => allocation.personExternalId));
    const projectAllowed = !settings.projectIds || settings.projectIds.includes(projectId);
    const items = allocations.map((allocation) => {
      const person = people.get(allocation.personExternalId);
      const assignee = person?.email ?? allocation.personEmail;
      const skipReason = !projectAllowed ? 'Проект не включён в запись плана'
        : person?.isMock ? 'Демо-участник'
          : !assignee ? 'Нет email у участника'
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
        pushedHours: allocation.azurePushedHours === null ? null : Number(allocation.azurePushedHours),
        action: skipReason ? 'skip' : allocation.azureTaskId ? 'update' : 'create',
        skipReason,
        taskTitle: allocation.azureTaskId ? null : renderWriteBackTemplate(settings.titleTemplate, this.templateValues(allocation)),
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
        create: items.filter((item) => item.action === 'create').length,
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
      this.prisma.roadmapProject.findMany({ orderBy: { name: 'asc' }, select: { id: true, externalId: true, name: true, url: true, syncedAt: true } }),
      this.prisma.roadmapAllocation.findMany({ select: { azureSyncStatus: true, azureSyncedAt: true, workItem: { select: { projectId: true } } } }),
      this.prisma.roadmapAllocation.findMany({
        where: { azureSyncStatus: 'error' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { role: true, workItem: { select: { projectId: true, externalId: true, title: true } } },
      }),
    ]);
    return {
      settings,
      projects: projects.map((project) => {
        const own = allocations.filter((allocation) => allocation.workItem.projectId === project.id);
        const count = (status: string | null) => own.filter((allocation) => allocation.azureSyncStatus === status).length;
        const lastPushedAt = own.reduce<Date | null>((latest, allocation) =>
          allocation.azureSyncedAt && (!latest || allocation.azureSyncedAt > latest) ? allocation.azureSyncedAt : latest, null);
        return {
          ...project,
          enabled: !settings.projectIds || settings.projectIds.includes(project.id),
          total: own.length,
          counts: { notSent: count(null), pending: count('pending'), synced: count('synced'), error: count('error'), skipped: count('skipped') },
          lastPushedAt,
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
    const project = await this.prisma.roadmapProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const settings = await this.integration.getWriteBackSettings();
    const checks: ReadinessCheck[] = [];
    let credentials: AzureDevOpsCredentials;
    try {
      credentials = await this.integration.getCredentials();
      await this.integration.requestJson(`${credentials.organizationUrl}/_apis/projects/${encodeURIComponent(project.externalId)}?api-version=${this.apiVersion}`, undefined, credentials);
      checks.push({ key: 'connection', label: 'Подключение и доступ к проекту', status: 'ok', detail: `Проект «${project.name}» доступен` });
    } catch (error) {
      checks.push({ key: 'connection', label: 'Подключение и доступ к проекту', status: 'error', detail: this.message(error) });
      return { checks };
    }

    checks.push(settings.mode === 'off'
      ? { key: 'mode', label: 'Режим записи', status: 'warning', detail: 'Запись выключена — в Azure DevOps ничего не отправляется' }
      : { key: 'mode', label: 'Режим записи', status: 'ok', detail: settings.mode === 'auto' ? 'Автоматически при сохранении' : 'По кнопке «Отправить в Azure»' });
    checks.push(!settings.projectIds || settings.projectIds.includes(projectId)
      ? { key: 'scope', label: 'Проект включён в запись', status: 'ok', detail: settings.projectIds ? 'Проект в списке разрешённых' : 'Запись разрешена для всех проектов' }
      : { key: 'scope', label: 'Проект включён в запись', status: 'error', detail: 'Проект не выбран в настройках записи — его назначения будут пропущены' });

    let typeFields: Set<string> | null = null;
    try {
      typeFields = await this.typeFields(project.externalId, settings.workItemType, credentials, true);
      const missing = [
        settings.fields.originalEstimate && !typeFields.has(ORIGINAL_ESTIMATE) ? 'Original Estimate' : null,
        settings.fields.remainingWork && !typeFields.has(REMAINING_WORK) ? 'Remaining Work' : null,
        !typeFields.has(COMPLETED_WORK) ? 'Completed Work (факт)' : null,
      ].filter(Boolean);
      checks.push(missing.length
        ? { key: 'type', label: `Тип «${settings.workItemType}» и поля`, status: 'warning', detail: `В процессе проекта нет полей: ${missing.join(', ')}. Они будут пропущены.` }
        : { key: 'type', label: `Тип «${settings.workItemType}» и поля`, status: 'ok', detail: 'Тип и поля плана/факта есть в процессе проекта' });
    } catch (error) {
      checks.push({ key: 'type', label: `Тип «${settings.workItemType}» и поля`, status: 'error', detail: this.message(error) });
    }

    const now = new Date();
    const currentQuarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    if (settings.fields.iteration) {
      const iteration = await this.quarterIterationPath(project.externalId, currentQuarter, credentials, true);
      checks.push(iteration
        ? { key: 'iteration', label: `Итерация для ${quarterLabel(currentQuarter)}`, status: 'ok', detail: iteration }
        : { key: 'iteration', label: `Итерация для ${quarterLabel(currentQuarter)}`, status: 'warning', detail: 'Не найдена итерация с кварталом в названии или датами на весь квартал — задачи попадут в итерацию проекта по умолчанию' });
    }

    const allocations = await this.prisma.roadmapAllocation.findMany({ where: { workItem: { projectId } }, include: allocationContext });
    const people = await this.peopleByExternalId(allocations.map((allocation) => allocation.personExternalId));
    const withoutEmail = new Set(allocations
      .filter((allocation) => !people.get(allocation.personExternalId)?.isMock && !(people.get(allocation.personExternalId)?.email ?? allocation.personEmail))
      .map((allocation) => allocation.personName));
    const mock = new Set(allocations.filter((allocation) => people.get(allocation.personExternalId)?.isMock).map((allocation) => allocation.personName));
    checks.push(withoutEmail.size
      ? { key: 'people', label: 'Участники', status: 'warning', detail: `Нет email, назначения не отправятся: ${[...withoutEmail].join(', ')}` }
      : { key: 'people', label: 'Участники', status: 'ok', detail: mock.size ? `Демо-участники будут пропущены: ${[...mock].join(', ')}` : 'У всех участников есть учётная запись' });

    const sample = allocations.find((allocation) => {
      const person = people.get(allocation.personExternalId);
      return !person?.isMock && (person?.email ?? allocation.personEmail);
    });
    if (typeFields) {
      try {
        const operations = sample
          ? await this.createOperations(sample, people.get(sample.personExternalId)?.email ?? sample.personEmail!, settings, typeFields, credentials)
          : [{ op: 'add' as const, path: '/fields/System.Title', value: 'Roadmap readiness check' }];
        await this.integration.requestJson(
          `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitems/$${encodeURIComponent(settings.workItemType)}?validateOnly=true&api-version=${this.apiVersion}`,
          { method: 'POST', body: JSON.stringify(operations), headers: { 'Content-Type': 'application/json-patch+json' } },
          credentials,
        );
        checks.push({
          key: 'write',
          label: 'Пробное создание задачи (без сохранения)',
          status: 'ok',
          detail: sample ? `Azure DevOps принял бы задачу «${renderWriteBackTemplate(settings.titleTemplate, this.templateValues(sample))}» для ${sample.personName}` : 'Права на запись есть',
        });
      } catch (error) {
        const forbidden = error instanceof AzureDevOpsHttpError && [401, 403].includes(error.httpStatus);
        checks.push({
          key: 'write',
          label: 'Пробное создание задачи (без сохранения)',
          status: 'error',
          detail: forbidden ? 'У PAT нет прав на запись. Выпустите PAT с правами Work Items: Read & Write.' : this.message(error),
        });
      }
    }

    const publicSettings = await this.integration.getPublicSettings();
    checks.push(publicSettings.webhookConfigured
      ? { key: 'webhook', label: 'Webhook для факта', status: 'ok', detail: 'Секрет создан. Убедитесь, что подписка в Azure DevOps активна.' }
      : { key: 'webhook', label: 'Webhook для факта', status: 'warning', detail: 'Не настроен — факт обновляется только кнопкой «Загрузить из Azure»' });
    return { checks };
  }

  /** Picks up allocations left pending by a restart in automatic mode. */
  @Interval(60_000)
  async recoverPending() {
    const settings = await this.integration.getWriteBackSettings().catch(() => null);
    if (settings?.mode !== 'auto') return;
    const pending = await this.prisma.roadmapAllocation.findMany({
      where: { azureSyncStatus: 'pending' },
      select: { id: true },
      take: 500,
    });
    if (pending.length) this.enqueue(pending.map((allocation) => allocation.id));
  }

  async handleWebhook(payload: AzureWebhookPayload) {
    const projectExternalId = payload.resourceContainers?.project?.id;
    const eventType = payload.eventType ?? '';
    const workItemId = eventType === 'workitem.updated' ? payload.resource?.workItemId : payload.resource?.id;
    if (!projectExternalId || !workItemId || !eventType.startsWith('workitem.')) return { accepted: false };
    const project = await this.prisma.roadmapProject.findUnique({ where: { externalId: projectExternalId }, select: { id: true } });
    if (!project) return { accepted: false };

    if (eventType === 'workitem.deleted') {
      await this.handleDeletedWorkItem(project.id, String(workItemId));
      return { accepted: true };
    }
    if (eventType === 'workitem.commented') return { accepted: false };

    // Bursts of events (bulk edits, our own pushes) are imported in one batch per project.
    const ids = this.pendingImports.get(project.id) ?? new Set<number>();
    ids.add(Number(workItemId));
    this.pendingImports.set(project.id, ids);
    this.importTimer ??= setTimeout(() => void this.flushWebhookImports(), WEBHOOK_DEBOUNCE_MS);
    return { accepted: true };
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
        this.logger.error(`Azure DevOps write-back failed for allocation ${id}`, error instanceof Error ? error.stack : error);
      }
    }
  }

  private async syncAllocation(id: string) {
    const settings = await this.integration.getWriteBackSettings();
    if (settings.mode === 'off') return;
    const allocation = await this.prisma.roadmapAllocation.findUnique({ where: { id }, include: allocationContext });
    if (!allocation || allocation.azureSyncStatus !== 'pending') return;
    const snapshot = allocation.updatedAt;
    const person = await this.prisma.roadmapPerson.findUnique({ where: { externalId: allocation.personExternalId } });

    let taskId = allocation.azureTaskId;
    const finish = async (data: Prisma.RoadmapAllocationUpdateManyMutationInput) => {
      const result = await this.prisma.roadmapAllocation.updateMany({ where: { id, updatedAt: snapshot }, data: { azureTaskId: taskId, ...data } });
      if (!result.count) {
        // The plan changed while we were talking to Azure DevOps: keep the task link and send again.
        await this.prisma.roadmapAllocation.updateMany({ where: { id }, data: { azureTaskId: taskId } });
        this.enqueue([id]);
      }
    };

    if (settings.projectIds && !settings.projectIds.includes(allocation.workItem.projectId)) {
      await finish({ azureSyncStatus: 'skipped', azureSyncError: 'Проект не включён в запись плана в настройках интеграции' });
      return;
    }
    if (person?.isMock) {
      await finish({ azureSyncStatus: 'skipped', azureSyncError: 'Демо-участник не передаётся в Azure DevOps' });
      return;
    }
    const assignee = person?.email ?? allocation.personEmail;
    if (!assignee) {
      await finish({ azureSyncStatus: 'error', azureSyncError: 'У участника нет email или учётной записи Azure DevOps' });
      return;
    }

    try {
      const credentials = await this.integration.getCredentials();
      const project = allocation.workItem.project;
      const estimate = Number(allocation.estimatedHours);
      const estimateChanged = allocation.azurePushedHours === null || Number(allocation.azurePushedHours) !== estimate;

      const existing = taskId ? await this.fetchTask(taskId, credentials) : null;
      if (existing) {
        const typeFields = await this.typeFields(project.externalId, String(existing.fields['System.WorkItemType'] ?? settings.workItemType), credentials);
        await this.updateTask(existing, { assignee, estimate, estimateChanged, settings, typeFields }, credentials);
      } else {
        const typeFields = await this.typeFields(project.externalId, settings.workItemType, credentials);
        const operations = await this.createOperations(allocation, assignee, settings, typeFields, credentials);
        const created = await this.integration.requestJson<AzureWorkItem>(
          `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitems/$${encodeURIComponent(settings.workItemType)}?api-version=${this.apiVersion}`,
          { method: 'POST', body: JSON.stringify(operations), headers: { 'Content-Type': 'application/json-patch+json' } },
          credentials,
        );
        taskId = String(created.id);
      }
      await this.importer.importWorkItems(project, [Number(taskId)], credentials);
      await finish({ azureSyncStatus: 'synced', azureSyncError: null, azureSyncedAt: new Date(), azurePushedHours: estimate });
    } catch (error) {
      await finish({ azureSyncStatus: 'error', azureSyncError: this.message(error).slice(0, 1000) });
    }
  }

  private async createOperations(
    allocation: AllocationWithContext,
    assignee: string,
    settings: WriteBackSettings,
    typeFields: Set<string>,
    credentials: AzureDevOpsCredentials,
  ) {
    const { workItem, role } = allocation;
    const project = workItem.project;
    const values = this.templateValues(allocation);
    const operations: PatchOperation[] = [
      { op: 'add', path: '/fields/System.Title', value: renderWriteBackTemplate(settings.titleTemplate, values).slice(0, 255) || workItem.title.slice(0, 255) },
      {
        op: 'add',
        path: '/relations/-',
        value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${credentials.organizationUrl}/_apis/wit/workItems/${workItem.externalId}` },
      },
      ...this.estimateOperations(Number(allocation.estimatedHours), 0, settings, typeFields, true),
    ];
    const tags = renderWriteBackTags(settings.tagsTemplate, values);
    if (tags) operations.push({ op: 'add', path: '/fields/System.Tags', value: tags });
    if (settings.fields.assignedTo) operations.push({ op: 'add', path: '/fields/System.AssignedTo', value: assignee });
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
        operations.push({ op: 'add', path: '/fields/System.AreaPath', value: parent.fields['System.AreaPath'] });
      }
    }
    if (settings.fields.iteration) {
      const iteration = await this.quarterIterationPath(project.externalId, allocation.quarterKey, credentials);
      if (iteration) operations.push({ op: 'add', path: '/fields/System.IterationPath', value: iteration });
    }
    return operations;
  }

  private async updateTask(
    initial: AzureWorkItem,
    input: { assignee: string; estimate: number; estimateChanged: boolean; settings: WriteBackSettings; typeFields: Set<string> },
    credentials: AzureDevOpsCredentials,
  ) {
    let task: AzureWorkItem | null = initial;
    for (let attempt = 0; attempt < 2 && task; attempt += 1) {
      const operations: PatchOperation[] = [];
      const assignedTo = task.fields['System.AssignedTo'] as { uniqueName?: string } | undefined;
      if (input.settings.fields.assignedTo && assignedTo?.uniqueName?.toLowerCase() !== input.assignee.toLowerCase()) {
        operations.push({ op: 'add', path: '/fields/System.AssignedTo', value: input.assignee });
      }
      if (input.estimateChanged) {
        const completed = Number(task.fields[COMPLETED_WORK] ?? 0) || 0;
        operations.push(...this.estimateOperations(input.estimate, completed, input.settings, input.typeFields, false));
      }
      if (!operations.length) return;
      try {
        // The revision check prevents overwriting Remaining Work computed from a stale Completed Work.
        await this.integration.request(
          `${credentials.organizationUrl}/_apis/wit/workitems/${task.id}?api-version=${this.apiVersion}`,
          {
            method: 'PATCH',
            body: JSON.stringify([{ op: 'test', path: '/rev', value: task.rev }, ...operations]),
            headers: { 'Content-Type': 'application/json-patch+json' },
          },
          credentials,
        );
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof AzureDevOpsHttpError && [409, 412].includes(error.httpStatus)) {
          task = await this.fetchTask(String(task.id), credentials);
          continue;
        }
        throw error;
      }
    }
  }

  private estimateOperations(estimate: number, completed: number, settings: WriteBackSettings, typeFields: Set<string>, creating: boolean): PatchOperation[] {
    const operations: PatchOperation[] = [];
    if (settings.fields.originalEstimate && typeFields.has(ORIGINAL_ESTIMATE)) {
      operations.push({ op: 'add', path: `/fields/${ORIGINAL_ESTIMATE}`, value: estimate });
    }
    if (settings.fields.remainingWork && typeFields.has(REMAINING_WORK) && (creating || settings.remainingWorkPolicy === 'recalculate')) {
      operations.push({ op: 'add', path: `/fields/${REMAINING_WORK}`, value: Math.max(0, estimate - completed) });
    }
    return operations;
  }

  private templateValues(allocation: AllocationWithContext): WriteBackTemplateValues {
    return {
      role: allocation.role.name,
      title: allocation.workItem.title,
      quarterKey: allocation.quarterKey,
      person: allocation.personName,
      id: allocation.workItem.externalId,
    };
  }

  /** Returns null when the task was deleted in Azure DevOps so it can be created again. */
  private async fetchTask(taskId: string, credentials: AzureDevOpsCredentials) {
    try {
      return await this.integration.requestJson<AzureWorkItem>(
        `${credentials.organizationUrl}/_apis/wit/workitems/${encodeURIComponent(taskId)}?fields=System.AssignedTo,System.WorkItemType,${COMPLETED_WORK}&api-version=${this.apiVersion}`,
        undefined,
        credentials,
      );
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError && error.httpStatus === 404) return null;
      throw error;
    }
  }

  /** Scheduling fields differ between processes (Agile/CMMI/Basic have Original Estimate, Scrum does not). */
  private async typeFields(projectExternalId: string, workItemType: string, credentials: AzureDevOpsCredentials, fresh = false) {
    const key = `${projectExternalId}:${workItemType.toLowerCase()}`;
    const cached = this.typeFieldCache.get(key);
    if (!fresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;
    const result = await this.integration.requestJson<{ value: { referenceName: string }[] }>(
      `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/fields?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    const value = new Set(result.value.map((field) => field.referenceName));
    this.typeFieldCache.set(key, { value, loadedAt: Date.now() });
    return value;
  }

  /** Finds the iteration for a `YYYY-Qn` quarter: by name first, then the narrowest one spanning the quarter. */
  private async quarterIterationPath(projectExternalId: string, quarterKey: string, credentials: AzureDevOpsCredentials, fresh = false) {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!match) return null;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
    const quarterEnd = Date.UTC(year, quarter * 3, 0);

    let cached = this.iterationCache.get(projectExternalId);
    if (fresh || !cached || Date.now() - cached.loadedAt >= CACHE_TTL_MS) {
      const root = await this.integration.requestJson<IterationNode>(
        `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=${this.apiVersion}`,
        undefined,
        credentials,
      ).catch(() => null);
      cached = { value: root, loadedAt: Date.now() };
      this.iterationCache.set(projectExternalId, cached);
    }
    if (!cached.value) return null;

    const nodes: IterationNode[] = [];
    const visit = (node: IterationNode) => { nodes.push(node); node.children?.forEach(visit); };
    cached.value.children?.forEach(visit);
    const namePattern = new RegExp(`(^|\\D)(${year}\\W*Q${quarter}|Q${quarter}\\W*${year})(\\D|$)`, 'i');
    const day = (value: string) => { const date = new Date(value); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()); };
    const byName = nodes.find((node) => namePattern.test(node.path ?? node.name));
    const spanning = nodes
      .filter((node) => node.attributes?.startDate && node.attributes.finishDate
        && day(node.attributes.startDate) <= quarterStart && day(node.attributes.finishDate) >= quarterEnd)
      .sort((left, right) => (day(left.attributes!.finishDate!) - day(left.attributes!.startDate!))
        - (day(right.attributes!.finishDate!) - day(right.attributes!.startDate!)));
    const node = byName ?? spanning[0];
    // Classification paths look like "\Project\Iteration\2026\Q4"; work items use "Project\2026\Q4".
    return node?.path ? node.path.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, '') : null;
  }

  private async flushWebhookImports() {
    this.importTimer = null;
    const batches = [...this.pendingImports.entries()];
    this.pendingImports.clear();
    for (const [projectId, ids] of batches) {
      try {
        const credentials = await this.integration.getCredentials();
        await this.importer.importWorkItems({ id: projectId }, [...ids], credentials);
      } catch (error) {
        this.logger.error(`Azure DevOps webhook import failed for project ${projectId}`, error instanceof Error ? error.stack : error);
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
        azureSyncError: 'Задача удалена в Azure DevOps. Нажмите «Отправить снова», чтобы создать её заново.',
      },
    });
    const local = await this.prisma.roadmapWorkItem.findUnique({
      where: { projectId_externalId: { projectId, externalId } },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (!local) return;
    // Planned work keeps its allocations; only items without a plan are removed.
    if (local._count.allocations) {
      await this.prisma.roadmapWorkItem.update({ where: { id: local.id }, data: { state: 'Deleted' } });
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
    return error instanceof Error ? error.message : 'Не удалось выполнить запрос к Azure DevOps';
  }

  private assertProjectAllowed(settings: WriteBackSettings, projectId: string) {
    if (settings.projectIds && !settings.projectIds.includes(projectId)) {
      throw new BadRequestException('Этот проект не включён в запись плана. Добавьте его в настройках интеграции.');
    }
  }

  private async assertWriteBackEnabled() {
    const settings = await this.integration.getWriteBackSettings();
    if (settings.mode === 'off') {
      throw new BadRequestException('Запись плана в Azure DevOps выключена. Включите её в администрировании Roadmap → Интеграции.');
    }
    return settings;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
