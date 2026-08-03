'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/features/auth/model/useAuth';
import {
  buildTourQueue,
  type TourQueueStop,
} from '@/features/onboarding/model/onboarding-plan';
import { routes } from '@/shared/config/routes';
import {
  getCompletedSteps,
  getTourState,
  setCompletedSteps,
  setTourState,
} from '@/shared/lib/onboarding-storage';

type TourContextValue = {
  isActive: boolean;
  /** Position within the current run */
  index: number;
  stop: TourQueueStop | null;
  total: number;
  /** Plan items completed by this user (tour runs and manual ticks alike) */
  completed: string[];
  /** Runs the tour for the given plan items, in order */
  startTour: (itemIds: string[]) => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
  toggleCompleted: (itemId: string) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) {
    throw new Error('useTour must be used inside TourProvider');
  }
  return value;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [completed, setCompletedState] = useState<string[]>([]);

  const userId = user?.id ?? '';

  useEffect(() => {
    if (userId) {
      setCompletedState(getCompletedSteps(userId));
    }
  }, [userId]);

  // Restore a run that was in progress before a reload / navigation.
  useEffect(() => {
    const stored = getTourState();
    if (stored.active && stored.itemIds.length > 0) {
      setItemIds(stored.itemIds);
      setIndex(stored.step);
      setIsActive(true);
    }
  }, []);

  const queue = useMemo(() => buildTourQueue(itemIds), [itemIds]);
  const stop = isActive ? (queue[index] ?? null) : null;

  // Each stop lives on a specific page — walk there before highlighting.
  useEffect(() => {
    if (stop && pathname !== stop.route) {
      router.push(stop.route);
    }
  }, [stop, pathname, router]);

  const markCompleted = useCallback(
    (itemId: string) => {
      setCompletedState((current) => {
        if (current.includes(itemId)) return current;
        const next = [...current, itemId];
        if (userId) setCompletedSteps(userId, next);
        return next;
      });
    },
    [userId],
  );

  const toggleCompleted = useCallback(
    (itemId: string) => {
      setCompletedState((current) => {
        const next = current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : [...current, itemId];
        if (userId) setCompletedSteps(userId, next);
        return next;
      });
    },
    [userId],
  );

  const persist = useCallback((active: boolean, ids: string[], position: number) => {
    setIsActive(active);
    setItemIds(ids);
    setIndex(position);
    setTourState({ active, itemIds: ids, step: position });
  }, []);

  const startTour = useCallback(
    (ids: string[]) => {
      if (buildTourQueue(ids).length === 0) return;
      persist(true, ids, 0);
    },
    [persist],
  );

  const exit = useCallback(() => persist(false, [], 0), [persist]);

  /** Finishing a run returns to the plan, so progress is visible right away. */
  const finish = useCallback(() => {
    exit();
    router.push(`${routes.welcome}?stage=plan`);
  }, [exit, router]);

  const next = useCallback(() => {
    const current = queue[index];
    if (!current) {
      finish();
      return;
    }
    // The row is ticked when its last stop is passed — not when it is opened.
    if (current.isItemEnd) {
      markCompleted(current.itemId);
    }
    if (index + 1 >= queue.length) {
      finish();
      return;
    }
    persist(true, itemIds, index + 1);
  }, [queue, index, markCompleted, finish, persist, itemIds]);

  const prev = useCallback(() => {
    persist(true, itemIds, Math.max(0, index - 1));
  }, [persist, itemIds, index]);

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      index,
      stop,
      total: queue.length,
      completed,
      startTour,
      next,
      prev,
      exit,
      toggleCompleted,
    }),
    [isActive, index, stop, queue.length, completed, startTour, next, prev, exit, toggleCompleted],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
