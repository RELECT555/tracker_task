import { Suspense } from 'react';
import { RoadmapCapacityPage } from '@/views/roadmap-analytics/ui/CapacityPage';

// Квартал читается из ?q= на клиенте, чтобы страница оставалась статической.
export default function Page() {
  return (
    <Suspense>
      <RoadmapCapacityPage />
    </Suspense>
  );
}
