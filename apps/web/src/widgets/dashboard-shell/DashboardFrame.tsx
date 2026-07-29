'use client';

import { Sidebar } from '@/widgets/sidebar/Sidebar';

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-sidebar dark:bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-l border-t border-border bg-background shadow-[inset_1px_0_0_hsl(var(--border)/0.5)] dark:rounded-none dark:border-t-0 dark:border-l-border/20 dark:shadow-none">
        {children}
      </div>
    </div>
  );
}
