'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Building2, FileType, GitBranch, LayoutGrid, Users } from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { PageBreadcrumbs } from '@/shared/ui/page-breadcrumbs';

const adminLinks: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}[] = [
  { href: routes.admin.root, label: 'Обзор', icon: LayoutGrid, exact: true },
  { href: routes.admin.requestTypes, label: 'Типы запросов', icon: FileType },
  { href: routes.admin.routeTemplates, label: 'Маршруты', icon: GitBranch },
  { href: routes.admin.users, label: 'Пользователи', icon: Users },
  { href: routes.admin.orgUnits, label: 'Подразделения', icon: Building2 },
];

function isLinkActive(pathname: string, href: string, exact?: boolean) {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();
  const activeLink = adminLinks.find((link) => isLinkActive(pathname, link.href, link.exact));
  const breadcrumbs = [
    { label: 'Рабочее пространство', href: routes.inbox },
    ...(activeLink?.exact
      ? [{ label: 'Администрирование' }]
      : [
          { label: 'Администрирование', href: routes.admin.root },
          { label: activeLink?.label ?? 'Администрирование' },
        ]),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumbs items={breadcrumbs} />

      <nav
        aria-label="Разделы администрирования"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1 sm:grid-cols-3 lg:grid-cols-5 dark:border-border/80 dark:bg-accent/40"
      >
        {adminLinks.map((link) => {
          const active = isLinkActive(pathname, link.href, link.exact);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm transition-all',
                active
                  ? 'border border-primary/25 bg-card font-medium text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] dark:bg-primary/12 dark:text-primary dark:shadow-none'
                  : 'border border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground dark:hover:bg-accent/60',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
                strokeWidth={1.5}
                aria-hidden
              />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
