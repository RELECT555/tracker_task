/**
 * Onboarding state lives in localStorage: the API has no per-user profile flags,
 * and a welcome tour is not worth a schema change.
 */
const SEEN_KEY = 'tracker.welcome.seen';
const PROGRESS_KEY = 'tracker.welcome.progress';
const TOUR_KEY = 'tracker.tour.state';

/** `itemIds` is the run being walked; `step` is the position inside it. */
export type TourState = { active: boolean; itemIds: string[]; step: number };

const IDLE_TOUR: TourState = { active: false, itemIds: [], step: 0 };

function readMap(key: string): Record<string, string[]> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, string[]>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — onboarding state is not worth surfacing an error.
  }
}

export function hasSeenWelcome(userId: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    return localStorage.getItem(`${SEEN_KEY}.${userId}`) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen(userId: string): void {
  try {
    localStorage.setItem(`${SEEN_KEY}.${userId}`, '1');
  } catch {
    // ignore
  }
}

export function getCompletedSteps(userId: string): string[] {
  return readMap(PROGRESS_KEY)[userId] ?? [];
}

export function setCompletedSteps(userId: string, steps: string[]): void {
  const map = readMap(PROGRESS_KEY);
  map[userId] = steps;
  writeMap(PROGRESS_KEY, map);
}

/** Tour position survives page navigation — the tour walks across real routes. */
export function getTourState(): TourState {
  if (typeof window === 'undefined') {
    return IDLE_TOUR;
  }
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (!raw) return IDLE_TOUR;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return IDLE_TOUR;
    const { active, step, itemIds } = parsed as Partial<TourState>;
    return {
      active: active === true,
      itemIds: Array.isArray(itemIds) ? itemIds.filter((id) => typeof id === 'string') : [],
      step: typeof step === 'number' && step >= 0 ? step : 0,
    };
  } catch {
    return IDLE_TOUR;
  }
}

export function setTourState(state: TourState): void {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
