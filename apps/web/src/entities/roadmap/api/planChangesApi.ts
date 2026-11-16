import { apiFetch } from '@/shared/api/client';
import { isRoadmapDemoMode, roadmapDemoApi } from './roadmapDemo';

/** Mirrors `PlanChangeSource` of the API. */
export type PlanChangeSource = 'plan' | 'ai' | 'azure';
export type PlanChangeAction = 'created' | 'updated' | 'deleted';

/** State of an allocation at one moment: the same shape in `before` and `after`. */
export interface AllocationSnapshot {
  personExternalId: string;
  personName: string;
  personEmail: string | null;
  quarterKey: string;
  estimatedHours: number;
  months: { monthKey: string; hours: number }[];
}

/** What became of the allocation's Azure Task on removal; `null` when there was no Task. */
export type PlanChangeTaskOutcome = 'kept' | 'state' | 'deleted' | null;

export interface PlanChangeDetails {
  /** Deletes only. */
  task?: PlanChangeTaskOutcome;
  /** Role-cell edits: the role's hours before and after the edit. */
  roleHours?: { from: number; to: number };
  [key: string]: unknown;
}

export interface PlanChange {
  id: string;
  batchId: string;
  action: PlanChangeAction;
  source: PlanChangeSource;
  /** `null` for changes that came from Azure DevOps. */
  actorName: string | null;
  actorEmail: string | null;
  workItemExternalId: string;
  workItemTitle: string;
  roleName: string;
  quarterKey: string;
  azureTaskId: string | null;
  before: AllocationSnapshot | null;
  after: AllocationSnapshot | null;
  details: PlanChangeDetails;
  createdAt: string;
}

export interface PlanChangeQuery {
  workItemExternalId?: string;
  personExternalId?: string;
  /** ISO date or date-time; entries created at or after it. */
  from?: string;
  /** ISO date or date-time; a plain date includes that whole day. */
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface PlanChangePage {
  items: PlanChange[];
  nextCursor: string | null;
}

export const planChangesApi = {
  list: (projectId: string, query: PlanChangeQuery = {}, signal?: AbortSignal): Promise<PlanChangePage> => {
    if (isRoadmapDemoMode()) return roadmapDemoApi.planChanges();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const search = params.toString();
    return apiFetch<PlanChangePage>(`/roadmap/projects/${encodeURIComponent(projectId)}/changes${search ? `?${search}` : ''}`, { signal });
  },
};

/** Key prefix shared by every plan change query: invalidate it after any allocation write. */
export const PLAN_CHANGES_QUERY_KEY = 'plan-changes';
export const planChangesQueryKey = (projectId: string, ...rest: unknown[]) => [PLAN_CHANGES_QUERY_KEY, projectId, ...rest] as const;
