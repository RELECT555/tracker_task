import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { AdminGuard } from '@/features/auth/ui/AdminGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapIntegrationsPage } from '@/views/roadmap-admin/ui/RoadmapIntegrationsPage';

export default function Page() {
  return (
    <AuthGuard>
      <AdminGuard>
        <RoadmapFrame>
          <RoadmapIntegrationsPage />
        </RoadmapFrame>
      </AdminGuard>
    </AuthGuard>
  );
}
