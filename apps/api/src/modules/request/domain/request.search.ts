import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestPriority,
  type RequestStatus,
} from '@tracker/shared';

/**
 * Shorter queries match almost everything, so they are dropped rather than
 * rejected — a search box should not error while the user is still typing.
 */
export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 100;

export type SearchSort = 'recent' | 'oldest';

export interface RawSearchInput {
  q?: string;
  status?: string;
  priority?: string;
  typeId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface SearchCriteria {
  q?: string;
  statuses: RequestStatus[];
  priorities: RequestPriority[];
  typeId?: string;
  /** Inclusive lower bound on `createdAt`. */
  createdFrom?: Date;
  /** Exclusive upper bound on `createdAt` — the start of the day after `dateTo`. */
  createdBefore?: Date;
  sort: SearchSort;
  page: number;
  limit: number;
}

export function normalizeSearchCriteria(raw: RawSearchInput): SearchCriteria {
  return {
    q: normalizeQuery(raw.q),
    statuses: parseEnumList(raw.status, REQUEST_STATUSES),
    priorities: parseEnumList(raw.priority, REQUEST_PRIORITIES),
    typeId: raw.typeId?.trim() || undefined,
    createdFrom: parseDay(raw.dateFrom),
    createdBefore: nextDay(parseDay(raw.dateTo)),
    sort: raw.sort === 'oldest' ? 'oldest' : 'recent',
    page: clamp(Math.trunc(raw.page ?? 1), 1, Number.MAX_SAFE_INTEGER),
    limit: clamp(Math.trunc(raw.limit ?? SEARCH_DEFAULT_LIMIT), 1, SEARCH_MAX_LIMIT),
  };
}

/** True when no filter narrows the result set — the caller may skip the query. */
export function isEmptyCriteria(criteria: SearchCriteria): boolean {
  return (
    !criteria.q &&
    criteria.statuses.length === 0 &&
    criteria.priorities.length === 0 &&
    !criteria.typeId &&
    !criteria.createdFrom &&
    !criteria.createdBefore
  );
}

function normalizeQuery(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length >= SEARCH_MIN_QUERY_LENGTH ? trimmed : undefined;
}

function parseEnumList<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T[] {
  if (!value) return [];
  const picked = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
  return [...new Set(picked)];
}

/** Parses a `YYYY-MM-DD` day into its UTC start; anything else yields undefined. */
function parseDay(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Turns an inclusive end day into an exclusive upper bound. */
function nextDay(value: Date | undefined): Date | undefined {
  if (!value) return undefined;
  return new Date(value.getTime() + 24 * 60 * 60 * 1000);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
