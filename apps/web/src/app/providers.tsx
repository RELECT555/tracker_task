'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/shared/ui/toast';
import { TourProvider } from '@/features/onboarding/model/TourProvider';
import { TourOverlay } from '@/features/onboarding/ui/TourOverlay';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TourProvider>
          {children}
          <TourOverlay />
        </TourProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
