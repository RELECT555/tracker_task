import type { SyncProblemStatusFilter } from '@tracker/shared';

export interface SyncProblemsFilter {
  status: SyncProblemStatusFilter;
  projectId: string | null;
}

const STATUSES: readonly SyncProblemStatusFilter[] = ['active', 'resolved', 'all'];

/** Reads the page filters from `?status=&project=`; unknown values fall back to the defaults. */
export function parseSyncQuery(search: URLSearchParams): SyncProblemsFilter {
  const status = search.get('status');
  return {
    status: STATUSES.includes(status as SyncProblemStatusFilter) ? (status as SyncProblemStatusFilter) : 'active',
    projectId: search.get('project') || null,
  };
}

/** Query string for the filters, without the defaults, so the plain page URL stays clean. */
export function serializeSyncQuery(filter: SyncProblemsFilter): string {
  const search = new URLSearchParams();
  if (filter.status !== 'active') search.set('status', filter.status);
  if (filter.projectId) search.set('project', filter.projectId);
  const value = search.toString();
  return value ? `?${value}` : '';
}
