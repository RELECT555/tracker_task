import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapPage } from '@/views/roadmap/ui/RoadmapPage';

export default function Page() {
  return (
    <AuthGuard>
      <RoadmapFrame>
        <RoadmapPage />
      </RoadmapFrame>
    </AuthGuard>
  );
}
