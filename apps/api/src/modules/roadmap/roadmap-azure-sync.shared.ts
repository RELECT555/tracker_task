import type { Prisma } from '@prisma/client';

/** Pieces shared by the Azure DevOps write-back services. */

export type IterationNode = {
  name: string;
  path?: string;
  attributes?: { startDate?: string; finishDate?: string };
  children?: IterationNode[];
};
export type PatchOperation = {
  op: 'add' | 'replace' | 'test';
  path: string;
  value: unknown;
};
export type CacheEntry<T> = { value: T; loadedAt: number };
export type AllocationWithContext = Prisma.RoadmapAllocationGetPayload<{
  include: { role: true; workItem: { include: { project: true } } };
}>;

export const CACHE_TTL_MS = 10 * 60 * 1000;
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;
export const CREATE_REJECTIONS = new Set([
  400, 401, 403, 404, 405, 415, 422, 429,
]);
export const UNKNOWN_CREATE =
  'Azure DevOps не подтвердил создание задачи. Повторная отправка проверит, появилась ли задача.';
export const ORIGINAL_ESTIMATE = 'Microsoft.VSTS.Scheduling.OriginalEstimate';
export const REMAINING_WORK = 'Microsoft.VSTS.Scheduling.RemainingWork';
export const COMPLETED_WORK = 'Microsoft.VSTS.Scheduling.CompletedWork';
/** Fields that `updateTask` writes only when they actually changed. */
export const UPDATE_MANAGED_FIELDS = new Set([
  'System.AssignedTo',
  ORIGINAL_ESTIMATE,
  REMAINING_WORK,
]);
export const allocationContext = {
  role: true,
  workItem: { include: { project: true } },
} as const;
export const nonEpicWorkItem = {
  type: { not: 'Epic', mode: 'insensitive' },
} satisfies Prisma.RoadmapWorkItemWhereInput;

export function azureErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить запрос к Azure DevOps';
}
