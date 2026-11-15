import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';

const cardClass = 'overflow-hidden rounded-xl border border-border bg-card';

function CardHeader() {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-72 max-w-full opacity-60" />
        </div>
      </div>
      <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
    </div>
  );
}

/** Заглушка карточки подключения Azure DevOps и вкладок настроек под ней. */
export function ConnectionSkeleton() {
  return (
    <SkeletonStatus label="Загружаем настройки подключения" className="space-y-6">
      <div className={cardClass}>
        <CardHeader />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          {[0, 1].map((index) => <div key={index} className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>)}
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </div>
      <div className="flex gap-1 shadow-[inset_0_-1px_0_hsl(var(--border))]">
        {['w-24', 'w-32', 'w-28', 'w-20'].map((width, index) => <div key={index} className="flex min-h-10 items-center px-3">
          <Skeleton className={`h-3.5 ${width}`} />
        </div>)}
      </div>
    </SkeletonStatus>
  );
}

/** Заглушка списка проектов в разделах синхронизации. */
export function ProjectsOverviewSkeleton() {
  return (
    <SkeletonStatus label="Загружаем данные о проектах" className={cardClass}>
      <CardHeader />
      <ul className="divide-y divide-border/70">
        {['w-48', 'w-36', 'w-56', 'w-40'].map((width, index) => <li key={index} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="size-4 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={`h-3.5 max-w-full ${width}`} />
            <Skeleton className="h-3 w-28 opacity-60" />
          </div>
          <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
        </li>)}
      </ul>
    </SkeletonStatus>
  );
}
