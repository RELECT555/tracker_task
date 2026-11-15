'use client';

import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { productTour } from '../model/tour-store';

/** Кнопка в шапке: запускает тур заново. */
export function TourLauncherIcon() {
  return (
    <button
      type="button"
      data-tour="tour-launcher"
      onClick={productTour.start}
      title="Тур по продукту"
      aria-label="Тур по продукту"
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <CircleHelp aria-hidden="true" className="size-4" />
    </button>
  );
}

/** Текстовая кнопка для страниц: стили передаются снаружи, чтобы совпасть с соседними кнопками. */
export function TourLauncherButton({ className, children }: { className?: string; children: ReactNode }) {
  return <button type="button" onClick={productTour.start} className={className}>{children}</button>;
}
