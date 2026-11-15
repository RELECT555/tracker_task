import { apiFetch } from '@/shared/api/client';

/** Actions on an allocation that write to its Azure DevOps Task. */
export const allocationAzureApi = {
  /** Adds hours to the Task's Completed Work (and takes them off Remaining Work). */
  logTime: (allocationId: string, hours: number, comment?: string) =>
    apiFetch<{ actualHours: number | null }>(`/roadmap/allocations/${encodeURIComponent(allocationId)}/time`, {
      method: 'POST',
      body: JSON.stringify({ hours, comment: comment?.trim() || undefined }),
    }),
  /** Takes the Task's estimate and assignee from Azure DevOps into the plan. */
  acceptFromAzure: (allocationId: string) =>
    apiFetch<{ accepted: true }>(`/roadmap/allocations/${encodeURIComponent(allocationId)}/azure-accept`, { method: 'POST', body: '{}' }),
  /** Removes the allocation; its Task follows the removal policy from the integration settings. */
  remove: (allocationId: string) =>
    apiFetch<{ deleted: true; task: 'kept' | 'state' | 'deleted' | null }>(`/roadmap/allocations/${encodeURIComponent(allocationId)}`, { method: 'DELETE' }),
};
