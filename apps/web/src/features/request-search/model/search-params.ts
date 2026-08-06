import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestPriority,
  type RequestStatus,
} from '@tracker/shared';

/** Mirrors SEARCH_MIN_QUERY_LENGTH on the API — shorter queries are not sent. */
export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_PAGE_SIZE = 20;

export type SearchSort = 'recent' | 'oldest';

export interface SearchFilters {
  q: string;
  statuses: RequestStatus[];
  priorities: RequestPriority[];
  typeId: string;
  dateFrom: string;
  dateTo: string;
  sort: SearchSort;
  page: number;
}

export const EMPTY_FILTERS: SearchFilters = {
  q: '',
  statuses: [],
  priorities: [],
  typeId: '',
  dateFrom: '',
  dateTo: '',
  sort: 'recent',
  page: 1,
};

export function parseSearchFilters(params: URLSearchParams): SearchFilters {
  const page = Number.parseInt(params.get('page') ?? '', 10);

  return {
    q: params.get('q') ?? '',
    statuses: parseEnumList(params.get('status'), REQUEST_STATUSES),
    priorities: parseEnumList(params.get('priority'), REQUEST_PRIORITIES),
    typeId: params.get('typeId') ?? '',
    dateFrom: parseDay(params.get('dateFrom')),
    dateTo: parseDay(params.get('dateTo')),
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'recent',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Serializes filters back into a URL query string, omitting defaults. */
export function serializeSearchFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.priorities.length) params.set('priority', filters.priorities.join(','));
  if (filters.typeId) params.set('typeId', filters.typeId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

/**
 * True when nothing narrows the result set. The API returns an empty page in
 * that case, so the UI shows a prompt instead of firing a pointless request.
 */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.q.trim().length >= SEARCH_MIN_QUERY_LENGTH ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.typeId !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''
  );
}

/** Count shown on the "reset" control — the query box is not counted as a chip. */
export function countActiveFilters(filters: SearchFilters): number {
  return (
    filters.statuses.length +
    filters.priorities.length +
    (filters.typeId ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)
  );
}

export function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

function parseEnumList<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T[] {
  if (!value) return [];
  const picked = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
  return [...new Set(picked)];
}

function parseDay(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}
