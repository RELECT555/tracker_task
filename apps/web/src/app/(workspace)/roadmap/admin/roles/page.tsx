import { Suspense } from 'react';
import { RoadmapRolesRoute } from '@/views/roadmap-admin/ui/RoadmapRolesPage';

// projectId читается на клиенте, чтобы страница оставалась статической
// и Next мог заранее подгрузить её целиком.
export default function Page() {
  return (
    <Suspense>
      <RoadmapRolesRoute />
    </Suspense>
  );
}
