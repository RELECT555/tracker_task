import { Injectable } from '@nestjs/common';
import { evaluateWriteRules, type TemplateContext } from '@tracker/shared';
import {
  AzureDevOpsCredentials,
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import { AzureWorkItem } from './roadmap-work-item-import.service';
import { textToHtml } from './azure-html';
import {
  renderWriteBackTags,
  renderWriteBackTemplate,
  WriteBackSettings,
  WriteBackTemplateValues,
} from './roadmap-write-back.settings';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import {
  COMPLETED_WORK,
  ORIGINAL_ESTIMATE,
  REMAINING_WORK,
  SYNC_REQUEST_TIMEOUT_MS,
  UNKNOWN_CREATE,
  UPDATE_MANAGED_FIELDS,
  type AllocationWithContext,
  type PatchOperation,
} from './roadmap-azure-sync.shared';

/** Builds and sends the Azure DevOps Task that mirrors an allocation. */
@Injectable()
export class RoadmapAzureTaskService {
  private readonly apiVersion = '7.1';

  constructor(
    private readonly integration: RoadmapIntegrationService,
    private readonly azureProcess: RoadmapAzureProcessService,
  ) {}

  async findCreatedAllocationTask(
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

  async createOperations(
    allocation: AllocationWithContext,
    assignee: string,
    settings: WriteBackSettings,
    typeFields: Set<string>,
    credentials: AzureDevOpsCredentials,
    attemptId?: string,
  ) {
    const { workItem } = allocation;
    const project = workItem.project;
    const values = {
      ...this.templateValues(allocation),
      personEmail: assignee,
    };
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
      const iteration = await this.azureProcess.quarterIterationPath(
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
          operations.push({
            op: 'add',
            path: `/fields/${targetField}`,
            value: toAzureValue(targetField, value),
          });
      }
    }
    return operations;
  }

  async updateTask(
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
      ? await this.azureProcess.iterationAfterQuarterMove(
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
              value: toAzureValue(targetField, value),
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

  templateValues(allocation: AllocationWithContext): WriteBackTemplateValues {
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
  async fetchTask(taskId: string, credentials: AzureDevOpsCredentials) {
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
}

/** Description is an HTML field in Azure DevOps; template text is plain, so it is escaped and split into paragraphs. */
function toAzureValue(field: string, value: string | number | boolean) {
  return field === 'System.Description' && typeof value === 'string'
    ? textToHtml(value)
    : value;
}
