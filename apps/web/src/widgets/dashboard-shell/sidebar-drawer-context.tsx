'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type SidebarDrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SidebarDrawerContext = createContext<SidebarDrawerContextValue | null>(null);

export function SidebarDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarDrawerContext.Provider>
  );
}

export function useSidebarDrawer() {
  const ctx = useContext(SidebarDrawerContext);
  if (!ctx) {
    throw new Error('useSidebarDrawer must be used within SidebarDrawerProvider');
  }
  return ctx;
}
