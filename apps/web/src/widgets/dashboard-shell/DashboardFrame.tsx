'use client';

import { Sidebar } from '@/widgets/sidebar/Sidebar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { MobileTabBar } from './MobileTabBar';
import { SidebarDrawerProvider } from './sidebar-drawer-context';

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <SidebarDrawerProvider>
      <div className="flex h-screen overflow-hidden bg-sidebar dark:bg-background">
        <Sidebar className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background pb-14 md:rounded-tl-2xl md:border-l md:border-t md:border-border md:pb-0 md:shadow-[inset_1px_0_0_hsl(var(--border)/0.5)] dark:md:border-t-0 dark:md:border-l-border/20 dark:md:shadow-none">
          {children}
        </div>
        <MobileSidebarDrawer />
        <MobileTabBar />
      </div>
    </SidebarDrawerProvider>
  );
}
