import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';

const panelClass = 'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card';

function PanelHeader() {
  return (
    <div className="space-y-3 border-b border-border p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-20 opacity-60" />
        </div>
      </div>
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}

/** Заглушка страницы ролей: выбор проекта, каталог слева и роли проекта справа. */
export function RolesPageSkeleton() {
  return (
    <SkeletonStatus label="Загружаем проекты и роли" className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-2 sm:max-w-sm">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[clamp(16rem,24%,20rem)_minmax(0,1fr)]">
        <div className={panelClass}>
          <PanelHeader />
          <div className="space-y-1 p-2">
            {['w-24', 'w-20', 'w-28', 'w-16', 'w-24'].map((width, index) => <div key={index} className="flex items-center gap-3 px-2 py-2.5">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <Skeleton className={`h-3 ${width}`} />
              <Skeleton className="ml-auto h-3 w-14 opacity-60" />
            </div>)}
          </div>
        </div>
        <div className={`@container ${panelClass}`}>
          <PanelHeader />
          <div className="grid grid-cols-1 gap-2 p-3 @min-[38rem]:grid-cols-2 @min-[60rem]:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-3 rounded-lg border border-border/70 p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <Skeleton className={index % 2 ? 'h-3.5 w-28' : 'h-3.5 w-36'} />
              </div>
              <Skeleton className="h-3 w-24 opacity-60" />
            </div>)}
          </div>
        </div>
      </div>
    </SkeletonStatus>
  );
}
