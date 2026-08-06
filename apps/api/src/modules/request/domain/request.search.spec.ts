import {
  isEmptyCriteria,
  normalizeSearchCriteria,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
} from './request.search';

describe('normalizeSearchCriteria', () => {
  it('applies defaults for an empty input', () => {
    expect(normalizeSearchCriteria({})).toEqual({
      q: undefined,
      statuses: [],
      priorities: [],
      typeId: undefined,
      createdFrom: undefined,
      createdBefore: undefined,
      sort: 'recent',
      page: 1,
      limit: SEARCH_DEFAULT_LIMIT,
    });
  });

  it('drops a query shorter than the minimum length', () => {
    expect(normalizeSearchCriteria({ q: 'a' }).q).toBeUndefined();
    expect(normalizeSearchCriteria({ q: '  ' }).q).toBeUndefined();
    expect(normalizeSearchCriteria({ q: '  отпуск ' }).q).toBe('отпуск');
  });

  it('keeps only known statuses and priorities, deduplicated', () => {
    const criteria = normalizeSearchCriteria({
      status: 'draft, in_progress ,bogus,draft',
      priority: 'urgent,nope',
    });

    expect(criteria.statuses).toEqual(['draft', 'in_progress']);
    expect(criteria.priorities).toEqual(['urgent']);
  });

  it('treats dateTo as an inclusive day by using the next day as an exclusive bound', () => {
    const criteria = normalizeSearchCriteria({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });

    expect(criteria.createdFrom?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(criteria.createdBefore?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('ignores dates that are not plain YYYY-MM-DD days', () => {
    const criteria = normalizeSearchCriteria({ dateFrom: '01.07.2026', dateTo: 'yesterday' });

    expect(criteria.createdFrom).toBeUndefined();
    expect(criteria.createdBefore).toBeUndefined();
  });

  it('clamps pagination into a safe range', () => {
    expect(normalizeSearchCriteria({ page: 0, limit: 0 }).page).toBe(1);
    expect(normalizeSearchCriteria({ page: -5 }).page).toBe(1);
    expect(normalizeSearchCriteria({ limit: 5000 }).limit).toBe(SEARCH_MAX_LIMIT);
    expect(normalizeSearchCriteria({ limit: 50 }).limit).toBe(50);
  });

  it('falls back to recent for an unknown sort', () => {
    expect(normalizeSearchCriteria({ sort: 'relevance' }).sort).toBe('recent');
    expect(normalizeSearchCriteria({ sort: 'oldest' }).sort).toBe('oldest');
  });
});

describe('isEmptyCriteria', () => {
  it('is true when nothing narrows the result set', () => {
    expect(isEmptyCriteria(normalizeSearchCriteria({}))).toBe(true);
    expect(isEmptyCriteria(normalizeSearchCriteria({ page: 3, sort: 'oldest' }))).toBe(true);
  });

  it('is false as soon as any filter is present', () => {
    expect(isEmptyCriteria(normalizeSearchCriteria({ q: 'ноутбук' }))).toBe(false);
    expect(isEmptyCriteria(normalizeSearchCriteria({ status: 'draft' }))).toBe(false);
    expect(isEmptyCriteria(normalizeSearchCriteria({ dateTo: '2026-07-31' }))).toBe(false);
  });
});
