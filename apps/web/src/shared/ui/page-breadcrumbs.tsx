import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/shared/lib/utils';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function PageBreadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Навигация" className={cn('text-sm', className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? (
                <li aria-hidden className="inline-flex items-center text-muted-foreground/45">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                </li>
              ) : null}
              <li className="inline-flex min-w-0 items-center">
                {isLast || !item.href ? (
                  <span
                    className={cn(
                      'block max-w-[min(100%,20rem)] truncate font-medium text-foreground',
                      isLast && 'dark:text-foreground/92',
                    )}
                    aria-current={isLast ? 'page' : undefined}
                    title={item.label}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="block max-w-[min(100%,16rem)] truncate text-muted-foreground transition-colors hover:text-foreground dark:text-foreground/62 dark:hover:text-foreground"
                    title={item.label}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
