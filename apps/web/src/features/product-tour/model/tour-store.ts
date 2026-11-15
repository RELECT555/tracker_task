import { useSyncExternalStore } from 'react';

const SEEN_STORAGE_KEY = 'roadmap:product-tour-seen';

type TourState = { active: boolean; index: number };

let state: TourState = { active: false, index: 0 };
const listeners = new Set<() => void>();

function emit(next: TourState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function hasSeenTour() {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY) === 'true';
  } catch {
    // Без хранилища не навязываем тур при каждом заходе.
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, 'true');
  } catch {
    // Тур работает и без сохранения отметки.
  }
}

export const productTour = {
  start() {
    markSeen();
    emit({ active: true, index: 0 });
  },
  stop() {
    markSeen();
    emit({ active: false, index: 0 });
  },
  goTo(index: number) {
    emit({ active: true, index });
  },
};

export function useProductTour() {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  return { ...current, ...productTour };
}
