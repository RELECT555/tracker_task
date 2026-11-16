import { GitBranch } from 'lucide-react';
import { Skeleton, SkeletonStatus } from '@/shared/ui/skeleton';

/**
 * Каркас приложения на время проверки сессии: повторяет сайдбар и шапку
 * RoadmapFrame, чтобы первая загрузка не начиналась с пустого экрана.
 */
export function RoadmapFrameSkeleton() {
  return (
    <div className="roadmap-frame relative flex h-dvh overflow-clip bg-sidebar dark:bg-background">
      <aside aria-hidden="true" className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border/60 bg-sidebar md:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border/60 pl-4 pr-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/25">
            <GitBranch className="size-5" strokeWidth={1.7} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight text-sidebar-foreground">Roadmap</span>
            <span className="mt-0.5 block text-[10px] uppercase tracking-[0.13em] text-sidebar-muted">Планирование</span>
          </span>
        </div>
        <div className="flex-1 space-y-0.5 px-3 py-5">
          <Skeleton className="mx-3 mb-3 h-2.5 w-28 bg-sidebar-accent dark:bg-sidebar-accent opacity-60" />
          {['w-20', 'w-28', 'w-24'].map((width, index) => <div key={index} className="flex h-9 items-center gap-3 px-3">
            <Skeleton className="size-[18px] shrink-0 rounded bg-sidebar-accent dark:bg-sidebar-accent" />
            <Skeleton className={`h-3 bg-sidebar-accent dark:bg-sidebar-accent ${width}`} />
          </div>)}
        </div>
        <div className="shrink-0 border-t border-sidebar-border/60 px-2.5 py-2.5">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Skeleton className="size-8 shrink-0 rounded-full bg-sidebar-accent dark:bg-sidebar-accent" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28 bg-sidebar-accent dark:bg-sidebar-accent" />
              <Skeleton className="h-2.5 w-36 bg-sidebar-accent dark:bg-sidebar-accent opacity-60" />
            </div>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background md:rounded-tl-2xl md:border-l md:border-t md:border-border dark:md:rounded-tl-none dark:md:border-l-0 dark:md:border-t-0">
        <header aria-hidden="true" className="flex min-h-16 shrink-0 items-center justify-between gap-x-2 border-b border-border bg-card px-3 py-1 sm:gap-x-4 sm:px-6">
          <Skeleton className="h-3.5 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
        </header>
        <SkeletonStatus label="Проверка авторизации" className="min-h-0 flex-1 space-y-6 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-2.5">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-3.5 w-80 max-w-full opacity-60" />
          </div>
          <Skeleton className="h-32 rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
          </div>
        </SkeletonStatus>
      </div>
    </div>
  );
}
