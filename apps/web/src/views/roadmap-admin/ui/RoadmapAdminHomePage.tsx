import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { roadmapAdminSections } from '@/shared/config/roadmap-admin-sections';
import { routes } from '@/shared/config/routes';
import { buttonVariants } from '@/shared/ui/button';
import { AdminPage, AdminPageHeader } from './AdminLayout';

export function RoadmapAdminHomePage() {
  return (
    <AdminPage>
      <AdminPageHeader
        title="Администрирование"
        actions={
          <Link href={routes.roadmap} className={buttonVariants({ variant: 'outline', className: 'focus-visible:ring-ring' })}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            К плану
          </Link>
        }
      />

      <nav aria-label="Разделы администрирования" className="@container">
        <ul className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 sm:gap-4">
          {roadmapAdminSections.map(({ id, href, title, description, icon: Icon }) => (
            <li key={id}>
              <Link
                href={href}
                aria-labelledby={`admin-section-title-${id}`}
                aria-describedby={`admin-section-description-${id}`}
                className="group flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5 dark:shadow-none"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-lg bg-status-progress-bg text-status-progress-fg">
                    <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-focus-visible:text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 id={`admin-section-title-${id}`} className="font-semibold text-foreground">{title}</h2>
                  <p id={`admin-section-description-${id}`} className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </AdminPage>
  );
}
