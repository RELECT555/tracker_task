import { apiFetch } from '@/shared/api/client';

export interface WorkItemCardPerson {
  name: string;
  email: string | null;
}

export interface WorkItemCardEstimates {
  original: number | null;
  remaining: number | null;
  completed: number | null;
}

export interface WorkItemCardComment {
  id: string;
  text: string;
  author: WorkItemCardPerson | null;
  createdAt: string | null;
  edited: boolean;
}

export interface WorkItemCardHistoryEntry {
  id: number;
  rev: number;
  author: WorkItemCardPerson | null;
  changedAt: string | null;
  created: boolean;
  changes: { field: string; from: string | null; to: string | null }[];
  linksAdded: number;
  linksRemoved: number;
}

/** Live Azure DevOps work item, read straight from Azure when the card opens. */
export interface WorkItemCard {
  id: string;
  rev: number;
  url: string | null;
  localWorkItemId: string | null;
  type: string;
  title: string;
  state: string | null;
  reason: string | null;
  assignedTo: WorkItemCardPerson | null;
  areaPath: string | null;
  iterationPath: string | null;
  priority: number | null;
  tags: string[];
  estimates: WorkItemCardEstimates;
  createdBy: WorkItemCardPerson | null;
  createdAt: string | null;
  changedBy: WorkItemCardPerson | null;
  changedAt: string | null;
  descriptionHtml: string | null;
  descriptionText: string;
  descriptionEditable: boolean;
  acceptanceCriteriaHtml: string | null;
  parent: { id: string; type: string; title: string } | null;
  children: { id: string; type: string; title: string; state: string | null; assignedTo: WorkItemCardPerson | null; estimates: WorkItemCardEstimates }[];
  states: { name: string; color: string | null; category: string | null }[];
  comments: WorkItemCardComment[];
  history: WorkItemCardHistoryEntry[];
  assignees: WorkItemCardPerson[];
  canEdit: boolean;
  readOnlyReason: string | null;
}

export interface WorkItemCardUpdate {
  rev: number;
  title?: string;
  state?: string;
  assignedTo?: string | null;
  description?: string;
  tags?: string[];
}

const cardUrl = (projectId: string, externalId: string) =>
  `/roadmap/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(externalId)}/azure`;

export const workItemCardApi = {
  get: (projectId: string, externalId: string, signal?: AbortSignal) =>
    apiFetch<WorkItemCard>(cardUrl(projectId, externalId), { signal }),
  update: (projectId: string, externalId: string, input: WorkItemCardUpdate) =>
    apiFetch<WorkItemCard>(cardUrl(projectId, externalId), { method: 'PATCH', body: JSON.stringify(input) }),
  comment: (projectId: string, externalId: string, text: string) =>
    apiFetch<WorkItemCardComment[]>(`${cardUrl(projectId, externalId)}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
};

export const workItemCardQueryKey = (projectId: string, externalId: string) => ['roadmap', 'work-item-card', projectId, externalId] as const;
