import { cn } from '@/shared/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md', className)}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-4 flex-1 max-w-xs" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:gap-8">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border/60 bg-muted/30 px-6 py-5">
          <div className="flex items-start gap-4">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
          </div>
        </div>
        <div className="space-y-6 p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-11 w-40" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-4 flex gap-3 last:mb-0">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-0.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}
