import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { escapeHtml, htmlToText, isPlainHtml, textToHtml } from './azure-html';
import { importWorkItemsRecorded } from './roadmap-import-health';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import {
  AzureDevOpsCredentials,
  AzureDevOpsHttpError,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

const API = '7.1';
const COMMENTS_API = '7.1-preview.4';
const HISTORY_LIMIT = 40;
const COMMENT_LIMIT = 50;

const F = {
  title: 'System.Title',
  type: 'System.WorkItemType',
  state: 'System.State',
  reason: 'System.Reason',
  assignedTo: 'System.AssignedTo',
  area: 'System.AreaPath',
  iteration: 'System.IterationPath',
  tags: 'System.Tags',
  description: 'System.Description',
  acceptance: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  priority: 'Microsoft.VSTS.Common.Priority',
  original: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
  remaining: 'Microsoft.VSTS.Scheduling.RemainingWork',
  completed: 'Microsoft.VSTS.Scheduling.CompletedWork',
  teamProject: 'System.TeamProject',
  createdBy: 'System.CreatedBy',
  createdDate: 'System.CreatedDate',
  changedBy: 'System.ChangedBy',
  changedDate: 'System.ChangedDate',
  history: 'System.History',
} as const;

/** Fields shown in the card history, with their Russian labels. HTML fields only report "changed". */
const HISTORY_FIELDS: Record<string, string> = {
  [F.title]: 'Название',
  [F.state]: 'Состояние',
  [F.reason]: 'Причина',
  [F.assignedTo]: 'Исполнитель',
  [F.iteration]: 'Итерация',
  [F.area]: 'Область',
  [F.tags]: 'Теги',
  [F.priority]: 'Приоритет',
  [F.original]: 'Исходная оценка',
  [F.remaining]: 'Осталось',
  [F.completed]: 'Факт',
  [F.description]: 'Описание',
  [F.acceptance]: 'Критерии приёмки',
  'System.Parent': 'Родитель',
};
const HTML_FIELDS = new Set<string>([F.description, F.acceptance]);
const CHILD_FIELDS = [
  'System.Id',
  F.title,
  F.type,
  F.state,
  F.assignedTo,
  F.original,
  F.remaining,
  F.completed,
];

type Identity = {
  displayName?: string;
  uniqueName?: string;
  imageUrl?: string;
};
type AzureItem = {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
  relations?: { rel: string; url: string }[];
  _links?: { html?: { href?: string } };
};
type AzureUpdate = {
  /** Update number; `rev` repeats for updates that only change links. */
  id: number;
  rev: number;
  revisedBy?: Identity;
  revisedDate?: string;
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
  relations?: { added?: unknown[]; removed?: unknown[] };
};
type AzureComment = {
  id: number;
  text?: string;
  createdBy?: Identity;
  createdDate?: string;
  modifiedDate?: string;
  isDeleted?: boolean;
};

export type WorkItemCardUpdate = {
  rev: number;
  title?: string;
  state?: string;
  /** Email or unique name; null clears the assignee. */
  assignedTo?: string | null;
  description?: string;
  tags?: string[];
};

export type WorkItemCardPerson = { name: string; email: string | null };

function person(value: unknown): WorkItemCardPerson | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // Older payloads use "Display Name <user@example.com>".
    const match = /^(.*?)\s*<([^>]+)>$/.exec(value);
    return match
      ? { name: match[1] || match[2], email: match[2] }
      : { name: value, email: null };
  }
  if (typeof value === 'object') {
    const identity = value as Identity;
    const email = identity.uniqueName ?? null;
    return { name: identity.displayName ?? email ?? '—', email };
  }
  return null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function tags(value: unknown) {
  return typeof value === 'string'
    ? value
        .split(';')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
}

function relationId(url: string) {
  const id = Number(/\/workItems\/(\d+)$/i.exec(url)?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function historyValue(field: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (field === F.assignedTo) return person(value)?.name ?? null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return person(value)?.name ?? null;
}

/**
 * Live Azure DevOps work item card shown inside Roadmap: read straight from Azure on open,
 * edited with a revision check, so nobody silently overwrites a change made in Azure meanwhile.
 */
@Injectable()
export class RoadmapWorkItemCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
    private readonly importer: RoadmapWorkItemImportService,
    private readonly azureSync: RoadmapAzureSyncService,
  ) {}

  async getCard(
    projectId: string,
    externalId: string,
    actorId: string,
    canEditProject: boolean,
  ) {
    const project = await this.project(projectId);
    const credentials = await this.integration.getCredentials();
    const item = await this.fetchItem(project, externalId, credentials);
    const type = text(item.fields[F.type]) ?? 'Task';
    const childIds = (item.relations ?? [])
      .filter(
        (relation) => relation.rel === 'System.LinkTypes.Hierarchy-Forward',
      )
      .map((relation) => relationId(relation.url))
      .filter((id): id is number => id !== null);
    const parentId = (item.relations ?? [])
      .filter(
        (relation) => relation.rel === 'System.LinkTypes.Hierarchy-Reverse',
      )
      .map((relation) => relationId(relation.url))
      .find((id): id is number => id !== null);

    const [related, states, comments, history, local, assignees, write] =
      await Promise.all([
        this.batch([...(parentId ? [parentId] : []), ...childIds], credentials),
        this.states(project.externalId, type, credentials),
        this.comments(project.externalId, item.id, credentials),
        this.history(item.id, item.rev, credentials),
        this.prisma.roadmapWorkItem.findUnique({
          where: { projectId_externalId: { projectId, externalId } },
          select: { id: true },
        }),
        this.assignees(projectId),
        this.writeAccess(actorId, projectId, canEditProject),
      ]);
    const relatedById = new Map(related.map((entry) => [entry.id, entry]));
    const description = text(item.fields[F.description]);
    const parent = parentId ? relatedById.get(parentId) : undefined;

    return {
      id: String(item.id),
      rev: item.rev,
      url: item._links?.html?.href ?? null,
      localWorkItemId: local?.id ?? null,
      type,
      title: text(item.fields[F.title]) ?? `#${item.id}`,
      state: text(item.fields[F.state]),
      reason: text(item.fields[F.reason]),
      assignedTo: person(item.fields[F.assignedTo]),
      areaPath: text(item.fields[F.area]),
      iterationPath: text(item.fields[F.iteration]),
      priority: number(item.fields[F.priority]),
      tags: tags(item.fields[F.tags]),
      estimates: {
        original: number(item.fields[F.original]),
        remaining: number(item.fields[F.remaining]),
        completed: number(item.fields[F.completed]),
      },
      createdBy: person(item.fields[F.createdBy]),
      createdAt: text(item.fields[F.createdDate]),
      changedBy: person(item.fields[F.changedBy]),
      changedAt: text(item.fields[F.changedDate]),
      descriptionHtml: description,
      descriptionText: htmlToText(description),
      descriptionEditable: isPlainHtml(description),
      acceptanceCriteriaHtml: text(item.fields[F.acceptance]),
      parent: parent
        ? {
            id: String(parent.id),
            type: text(parent.fields[F.type]) ?? '',
            title: text(parent.fields[F.title]) ?? `#${parent.id}`,
          }
        : null,
      children: childIds
        .map((id) => relatedById.get(id))
        .filter((child): child is AzureItem => Boolean(child))
        .map((child) => ({
          id: String(child.id),
          type: text(child.fields[F.type]) ?? '',
          title: text(child.fields[F.title]) ?? `#${child.id}`,
          state: text(child.fields[F.state]),
          assignedTo: person(child.fields[F.assignedTo]),
          estimates: {
            original: number(child.fields[F.original]),
            remaining: number(child.fields[F.remaining]),
            completed: number(child.fields[F.completed]),
          },
        })),
      states,
      comments,
      history,
      assignees,
      canEdit: write.canEdit,
      readOnlyReason: write.reason,
    };
  }

  async update(
    projectId: string,
    externalId: string,
    input: WorkItemCardUpdate,
    actor: { id: string; email: string },
    canEditProject: boolean,
  ) {
    await this.assertCanWrite(actor.id, projectId, canEditProject);
    const project = await this.project(projectId);
    const credentials = await this.integration.getCredentials();
    const current = await this.fetchItem(project, externalId, credentials);
    const operations: { op: string; path: string; value: unknown }[] = [];
    const set = (field: string, value: unknown) =>
      operations.push({ op: 'add', path: `/fields/${field}`, value });

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title && title !== current.fields[F.title]) set(F.title, title);
    }
    if (input.state !== undefined && input.state !== current.fields[F.state])
      set(F.state, input.state);
    if (input.assignedTo !== undefined) {
      const was = person(current.fields[F.assignedTo])?.email ?? null;
      const next = input.assignedTo?.trim() || null;
      if (was?.toLowerCase() !== next?.toLowerCase())
        set(F.assignedTo, next ?? '');
    }
    if (input.description !== undefined) {
      const html = text(current.fields[F.description]);
      if (!isPlainHtml(html))
        throw new ConflictException(
          'Описание содержит форматирование — измените его в Azure DevOps.',
        );
      if (input.description.trim() !== htmlToText(html))
        set(F.description, textToHtml(input.description));
    }
    if (input.tags !== undefined) {
      const next = [
        ...new Set(
          input.tags
            .map((tag) => tag.replace(/;/g, ',').trim())
            .filter(Boolean),
        ),
      ];
      const was = tags(current.fields[F.tags]);
      if (next.join(';').toLowerCase() !== was.join(';').toLowerCase())
        set(F.tags, next.join('; '));
    }
    if (!operations.length)
      return this.getCard(projectId, externalId, actor.id, canEditProject);

    // Azure records the PAT owner as the author, so the discussion names the real person.
    set(
      F.history,
      `<div><i>Изменено в Roadmap: ${escapeHtml(await this.actorName(actor))}</i></div>`,
    );
    try {
      await this.integration.request(
        `${credentials.organizationUrl}/_apis/wit/workitems/${current.id}?api-version=${API}`,
        {
          method: 'PATCH',
          body: JSON.stringify([
            { op: 'test', path: '/rev', value: input.rev },
            ...operations,
          ]),
          headers: { 'Content-Type': 'application/json-patch+json' },
        },
        credentials,
      );
    } catch (error) {
      throw this.writeError(error);
    }
    await this.refreshLocal(projectId, current.id, credentials);
    return this.getCard(projectId, externalId, actor.id, canEditProject);
  }

  async addComment(
    projectId: string,
    externalId: string,
    body: string,
    actor: { id: string; email: string },
    canEditProject: boolean,
  ) {
    await this.assertCanWrite(actor.id, projectId, canEditProject);
    const project = await this.project(projectId);
    const credentials = await this.integration.getCredentials();
    const item = await this.fetchItem(project, externalId, credentials);
    const html = `${textToHtml(body)}<div><i>— ${escapeHtml(await this.actorName(actor))}, через Roadmap</i></div>`;
    try {
      await this.integration.request(
        `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workItems/${item.id}/comments?api-version=${COMMENTS_API}`,
        { method: 'POST', body: JSON.stringify({ text: html }) },
        credentials,
      );
    } catch (error) {
      throw this.writeError(error);
    }
    return this.comments(project.externalId, item.id, credentials);
  }

  private async project(projectId: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { id: true, externalId: true, name: true },
    });
    if (!project) throw new NotFoundException('Проект Roadmap не найден');
    return project;
  }

  /** Reads the item through the project URL and checks it really belongs to this project. */
  private async fetchItem(
    project: { externalId: string; name: string },
    externalId: string,
    credentials: AzureDevOpsCredentials,
  ) {
    let item: AzureItem;
    try {
      item = await this.integration.requestJson<AzureItem>(
        `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitems/${encodeURIComponent(externalId)}?$expand=all&api-version=${API}`,
        undefined,
        credentials,
      );
    } catch (error) {
      if (error instanceof AzureDevOpsHttpError && error.httpStatus === 404)
        throw new NotFoundException(
          'Элемент не найден в Azure DevOps — возможно, его удалили.',
        );
      throw error;
    }
    const teamProject = text(item.fields[F.teamProject]);
    if (teamProject && teamProject.toLowerCase() !== project.name.toLowerCase())
      throw new NotFoundException('Элемент не относится к этому проекту.');
    return item;
  }

  private async batch(ids: number[], credentials: AzureDevOpsCredentials) {
    if (!ids.length) return [];
    const result = await this.integration
      .requestJson<{ value: AzureItem[] }>(
        `${credentials.organizationUrl}/_apis/wit/workitemsbatch?api-version=${API}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ids: ids.slice(0, 200),
            fields: CHILD_FIELDS,
            errorPolicy: 'omit',
          }),
        },
        credentials,
      )
      .catch(() => ({ value: [] as AzureItem[] }));
    return result.value.filter(Boolean);
  }

  private async states(
    projectExternalId: string,
    type: string,
    credentials: AzureDevOpsCredentials,
  ) {
    const result = await this.integration
      .requestJson<{
        value: { name: string; color?: string; category?: string }[];
      }>(
        `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=${API}`,
        undefined,
        credentials,
      )
      .catch(() => ({ value: [] }));
    return result.value.map(({ name, color, category }) => ({
      name,
      color: color ? `#${color}` : null,
      category: category ?? null,
    }));
  }

  private async comments(
    projectExternalId: string,
    id: number,
    credentials: AzureDevOpsCredentials,
  ) {
    const result = await this.integration
      .requestJson<{ comments?: AzureComment[] }>(
        `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/workItems/${id}/comments?$top=${COMMENT_LIMIT}&order=desc&api-version=${COMMENTS_API}`,
        undefined,
        credentials,
      )
      .catch(() => ({ comments: [] as AzureComment[] }));
    return (result.comments ?? [])
      .filter((comment) => !comment.isDeleted)
      .map((comment) => ({
        id: String(comment.id),
        text: htmlToText(comment.text),
        author: person(comment.createdBy),
        createdAt: comment.createdDate ?? null,
        edited: Boolean(
          comment.modifiedDate && comment.modifiedDate !== comment.createdDate,
        ),
      }));
  }

  /** Last revisions, newest first, limited to fields people care about. */
  private async history(
    id: number,
    rev: number,
    credentials: AzureDevOpsCredentials,
  ) {
    const skip = Math.max(0, rev - HISTORY_LIMIT);
    const result = await this.integration
      .requestJson<{ value?: AzureUpdate[] }>(
        `${credentials.organizationUrl}/_apis/wit/workItems/${id}/updates?$skip=${skip}&$top=${HISTORY_LIMIT}&api-version=${API}`,
        undefined,
        credentials,
      )
      .catch(() => ({ value: [] as AzureUpdate[] }));
    return (result.value ?? [])
      .map((update) => {
        const changes = Object.entries(update.fields ?? {})
          .filter(([field]) => HISTORY_FIELDS[field])
          .map(([field, change]) => ({
            field: HISTORY_FIELDS[field],
            from: HTML_FIELDS.has(field)
              ? null
              : historyValue(field, change.oldValue),
            to: HTML_FIELDS.has(field)
              ? null
              : historyValue(field, change.newValue),
          }));
        const idField = update.fields?.['System.Id'];
        return {
          id: update.id,
          rev: update.rev,
          author: person(update.revisedBy),
          changedAt:
            text(update.fields?.[F.changedDate]?.newValue) ??
            update.revisedDate ??
            null,
          // Only the creating update sets System.Id; link-only updates also carry rev 1.
          created:
            idField?.newValue !== undefined && idField.oldValue === undefined,
          changes,
          linksAdded: update.relations?.added?.length ?? 0,
          linksRemoved: update.relations?.removed?.length ?? 0,
        };
      })
      .filter(
        (entry) =>
          entry.created ||
          entry.changes.length ||
          entry.linksAdded ||
          entry.linksRemoved,
      )
      .reverse();
  }

  private async assignees(projectId: string) {
    const members = await this.prisma.roadmapRoleMember.findMany({
      where: {
        role: { projectId },
        person: { isActive: true, isMock: false, email: { not: null } },
      },
      select: { person: { select: { name: true, email: true } } },
    });
    const unique = new Map<string, WorkItemCardPerson>();
    for (const { person: member } of members)
      unique.set(member.email!.toLowerCase(), member);
    return [...unique.values()].sort((left, right) =>
      left.name.localeCompare(right.name, 'ru'),
    );
  }

  private async writeAccess(
    actorId: string,
    projectId: string,
    canEditProject: boolean,
  ): Promise<{ canEdit: boolean; reason: string | null }> {
    if (!canEditProject)
      return {
        canEdit: false,
        reason: 'У вас доступ только на просмотр проекта.',
      };
    const settings = await this.integration.getWriteBackSettings();
    if (settings.mode === 'off')
      return {
        canEdit: false,
        reason: 'Запись в Azure DevOps выключена в настройках интеграции.',
      };
    if (settings.projectIds && !settings.projectIds.includes(projectId))
      return {
        canEdit: false,
        reason: 'Проект не включён в запись в Azure DevOps.',
      };
    if (!(await this.azureSync.canManuallyPush(actorId, settings)))
      return {
        canEdit: false,
        reason: 'Изменять Azure DevOps из Roadmap могут только администраторы.',
      };
    return { canEdit: true, reason: null };
  }

  private async assertCanWrite(
    actorId: string,
    projectId: string,
    canEditProject: boolean,
  ) {
    const access = await this.writeAccess(actorId, projectId, canEditProject);
    if (!access.canEdit) throw new ForbiddenException(access.reason);
  }

  private async actorName(actor: { id: string; email: string }) {
    const user = await this.prisma.user
      .findUnique({ where: { id: actor.id }, select: { fullName: true } })
      .catch(() => null);
    return user?.fullName || actor.email;
  }

  /** Keeps the plan table in step with what was just written. */
  private async refreshLocal(
    projectId: string,
    id: number,
    credentials: AzureDevOpsCredentials,
  ) {
    await importWorkItemsRecorded(
      this.prisma,
      this.importer,
      projectId,
      [id],
      credentials,
    ).catch(() => undefined);
  }

  private writeError(error: unknown) {
    if (error instanceof AzureDevOpsHttpError) {
      if ([409, 412].includes(error.httpStatus))
        return new ConflictException(
          'Элемент изменили в Azure DevOps, пока вы его редактировали. Обновите карточку и повторите.',
        );
      if (error.httpStatus === 400)
        return new ConflictException(
          `Azure DevOps отклонил изменение: ${this.azureMessage(error)}`,
        );
    }
    return error;
  }

  private azureMessage(error: AzureDevOpsHttpError) {
    const details = error.message.replace(/^Azure DevOps returned \d+: /, '');
    try {
      const body = JSON.parse(details) as { message?: string };
      if (body.message) return body.message;
    } catch {
      // Not JSON (or cut at 500 characters) — fall through.
    }
    return 'проверьте значения полей.';
  }
}
