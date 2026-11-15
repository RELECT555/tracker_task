import { Fragment } from 'react';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';

// Ширина названий чередуется, чтобы заглушка не выглядела как ровная решётка.
const EPICS = [
  { title: 'w-2/3', features: ['w-3/4', 'w-1/2', 'w-2/3'] },
  { title: 'w-1/2', features: ['w-2/3', 'w-3/5'] },
  { title: 'w-3/5', features: ['w-1/2', 'w-3/4'] },
];
const ROLE_COLUMNS = 3;
const ROW_GRID = 'grid grid-cols-[minmax(12rem,1fr)_5rem_5rem] items-center sm:grid-cols-[minmax(16rem,1fr)_5.5rem_5.5rem_repeat(3,5.5rem)]';

function NumberCells({ muted = false }: { muted?: boolean }) {
  return <>
    {Array.from({ length: 2 + ROLE_COLUMNS }, (_, index) => <div key={index} className={index >= 2 ? 'hidden px-3 sm:block' : 'px-3'}>
      <Skeleton className={muted ? 'ml-auto h-3 w-8 opacity-60' : 'ml-auto h-3 w-10'} />
    </div>)}
  </>;
}

/** Заглушка сводной таблицы проектов, пока грузится её код. */
export function PortfolioTableSkeleton() {
  return (
    <SkeletonStatus label="Загружаем таблицу проектов" className="min-w-0">
      <div className="flex items-center gap-4 border-b border-border bg-muted/50 px-4 py-3.5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="ml-auto h-3 w-48 max-w-[40%]" />
      </div>
      {['w-2/5', 'w-1/3', 'w-1/2', 'w-1/4'].map((width, index) => <div key={index} className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3.5 last:border-b-0">
        <Skeleton className="size-4 shrink-0 rounded" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className={`h-3.5 ${width}`} />
          <Skeleton className="h-2.5 w-24 opacity-60" />
        </div>
        <Skeleton className="h-3 w-10" />
        <Skeleton className="hidden h-3 w-10 sm:block" />
        <Skeleton className="hidden h-3 w-14 sm:block" />
      </div>)}
    </SkeletonStatus>
  );
}

/** Заглушка карточки плана проекта: повторяет шапку, панель и строки таблицы. */
export function PlanTableSkeleton({ label }: { label: string }) {
  return (
    <SkeletonStatus label={label} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64 max-w-[60vw]" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="hidden h-9 w-32 rounded-lg sm:block" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="ml-auto h-8 w-9 rounded-lg" />
      </div>
      <div className="min-w-0 overflow-hidden">
        <div className={`${ROW_GRID} border-b border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] py-3`}>
          <div className="px-4"><Skeleton className="h-3 w-24" /></div>
          <NumberCells muted />
        </div>
        {EPICS.map((epic, epicIndex) => <Fragment key={epicIndex}>
          <div className={`${ROW_GRID} border-t border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,var(--color-card))] py-3 first:border-t-0`}>
            <div className="flex items-center gap-3 px-4">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className={`h-3.5 ${epic.title}`} />
            </div>
            <NumberCells />
          </div>
          {epic.features.map((width, featureIndex) => <div key={featureIndex} className={`${ROW_GRID} border-t border-border/60 py-2.5`}>
            <div className="flex items-center gap-3 pl-11 pr-4">
              <Skeleton className="size-3.5 shrink-0 rounded" />
              <Skeleton className={`h-3 ${width}`} />
            </div>
            <NumberCells muted />
          </div>)}
        </Fragment>)}
        <div className={`${ROW_GRID} border-t-2 border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] py-3`}>
          <div className="px-4"><Skeleton className="h-3.5 w-32" /></div>
          <NumberCells />
        </div>
      </div>
    </SkeletonStatus>
  );
}
