import { Suspense } from 'react';
import { SyncProblemsPage } from '@/views/roadmap-sync/ui/SyncProblemsPage';

// Фильтры читаются из ?status=&project= на клиенте, чтобы страница оставалась статической.
export default function Page() {
  return (
    <Suspense>
      <SyncProblemsPage />
    </Suspense>
  );
}
