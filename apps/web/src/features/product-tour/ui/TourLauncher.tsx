'use client';

import type { ReactNode } from 'react';
import { productTour } from '../model/tour-store';

/** Текстовая кнопка для страниц: стили передаются снаружи, чтобы совпасть с соседними кнопками. */
export function TourLauncherButton({ className, children }: { className?: string; children: ReactNode }) {
  return <button type="button" onClick={productTour.start} className={className}>{children}</button>;
}
