'use client';

import { useQueries } from '@tanstack/react-query';
import { roadmapQuarterMonthKeys } from '@tracker/shared';
import { getRoadmapMonthlyFact, roadmapMonthlyFactQueryKey, type RoadmapMonthlyFact } from '@/entities/roadmap/api/roadmapApi';

/** Months of the quarter that have already started; later months cannot carry fact yet. */
function startedMonthKeys(quarterKey: string, now = Date.now()) {
  return roadmapQuarterMonthKeys(quarterKey).filter((monthKey) => new Date(`${monthKey}-01T00:00:00.000Z`).getTime() <= now);
}

/**
 * Monthly fact for every started month of the quarter, shared with the month view's cache. The quarter's
 * card counts use it to include cards that have fact but no plan. Undefined until every month has loaded:
 * until then, or if a month fails, the counts stay plan-only rather than mixing complete and missing months.
 * A quarter that has not started yet has no fact to load and also returns undefined.
 */
export function useRoadmapQuarterFact({ projectId, quarterKey, enabled, refetchInterval, includeChildEpics = false }: {
  projectId: string;
  quarterKey: string;
  enabled: boolean;
  refetchInterval?: number | false;
  includeChildEpics?: boolean;
}): RoadmapMonthlyFact[] | undefined {
  const monthKeys = enabled ? startedMonthKeys(quarterKey) : [];
  return useQueries({
    queries: monthKeys.map((monthKey) => ({
      queryKey: roadmapMonthlyFactQueryKey(projectId, monthKey, includeChildEpics),
      queryFn: ({ signal }: { signal: AbortSignal }) => getRoadmapMonthlyFact(projectId, monthKey, signal, includeChildEpics),
      staleTime: 5 * 60 * 1000,
      refetchInterval,
      retry: false,
    })),
    combine: allMonthsLoaded,
  });
}

/** Module-level, so React Query keeps the combined array stable between renders. */
function allMonthsLoaded(results: { data?: RoadmapMonthlyFact }[]) {
  return results.length && results.every((result) => result.data)
    ? results.map((result) => result.data!)
    : undefined;
}
