import { cn } from '@/shared/lib/utils';

/** Серая заглушка на месте будущего содержимого. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('roadmap-skeleton rounded-md bg-muted dark:bg-foreground/10', className)} {...props} />;
}

/**
 * Обёртка набора заглушек: объявляет загрузку для скринридеров и проявляется
 * с задержкой, чтобы при быстром ответе скелетон не мигал.
 */
export function SkeletonStatus({ label, className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div role="status" className={cn('roadmap-skeleton-group', className)} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
