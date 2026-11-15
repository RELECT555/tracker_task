import { Suspense } from 'react';
import { RoadmapProgressPage } from '@/views/roadmap-analytics/ui/ProgressPage';

export default function Page() {
  return (
    <Suspense>
      <RoadmapProgressPage />
    </Suspense>
  );
}
