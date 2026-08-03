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
import { TOUR_STEPS, type TourStep } from '@/features/onboarding/model/tour-steps';
import {
  getCompletedSteps,
  getTourState,
  setCompletedSteps,
  setTourState,
} from '@/shared/lib/onboarding-storage';

type TourContextValue = {
  isActive: boolean;
  stepIndex: number;
  step: TourStep | null;
  total: number;
  start: (from?: number) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
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
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Restore a tour that was running before a reload / navigation.
  useEffect(() => {
    const stored = getTourState();
    if (stored.active && stored.step < TOUR_STEPS.length) {
      setIsActive(true);
      setStepIndex(stored.step);
    }
  }, []);

  const step = isActive ? (TOUR_STEPS[stepIndex] ?? null) : null;

  // Each step lives on a specific page — walk there before highlighting.
  useEffect(() => {
    if (step && pathname !== step.route) {
      router.push(step.route);
    }
  }, [step, pathname, router]);

  // Visiting a step ticks off the matching item in the welcome plan.
  useEffect(() => {
    if (!step?.planStepId || !user?.id) return;
    const done = getCompletedSteps(user.id);
    if (!done.includes(step.planStepId)) {
      setCompletedSteps(user.id, [...done, step.planStepId]);
    }
  }, [step, user?.id]);

  const persist = useCallback((active: boolean, index: number) => {
    setIsActive(active);
    setStepIndex(index);
    setTourState({ active, step: index });
  }, []);

  const start = useCallback((from = 0) => persist(true, from), [persist]);
  const stop = useCallback(() => persist(false, 0), [persist]);

  const next = useCallback(() => {
    if (stepIndex + 1 >= TOUR_STEPS.length) {
      stop();
      return;
    }
    persist(true, stepIndex + 1);
  }, [persist, stepIndex, stop]);

  const prev = useCallback(() => {
    persist(true, Math.max(0, stepIndex - 1));
  }, [persist, stepIndex]);

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      stepIndex,
      step,
      total: TOUR_STEPS.length,
      start,
      next,
      prev,
      stop,
    }),
    [isActive, stepIndex, step, start, next, prev, stop],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
