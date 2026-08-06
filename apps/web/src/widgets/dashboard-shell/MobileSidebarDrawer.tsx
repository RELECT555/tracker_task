'use client';

import { X } from 'lucide-react';
import { Sidebar } from '@/widgets/sidebar/Sidebar';
import { useSidebarDrawer } from './sidebar-drawer-context';

export function MobileSidebarDrawer() {
  const { open, setOpen } = useSidebarDrawer();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        aria-label="Закрыть меню"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-200"
      />
      <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs animate-in slide-in-from-left duration-200">
        <Sidebar className="w-full" onNavigate={() => setOpen(false)} />
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent/60 text-sidebar-muted"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
